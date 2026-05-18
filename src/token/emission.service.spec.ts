import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

const mockQueryRunner = {
    connect:           jest.fn(),
    startTransaction:  jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release:           jest.fn(),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue({}),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockSupplyRepo = {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
};

describe('EmissionService — canonical 1:1 model', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService,                       useValue: mockLedgerService },
                { provide: DataSource,                          useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ── calculate() ────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 — emission equals transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('commission = txAmount × defaultRate (0.5%)', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('nodeShare = 75% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare = 25% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('uses provided commissionRate over default', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('dust amount — $0.01 emits exactly 0.01 ARO', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01, 8);
        });

        it('large amount — $1,000,000 emits 1,000,000 ARO', () => {
            const result = service.calculate(1_000_000);
            expect(result.emissionAmount).toBe(1_000_000);
            expect(result.commission).toBeCloseTo(5_000, 8);
            expect(result.nodeShare).toBeCloseTo(3_750, 8);
            expect(result.afcReserveShare).toBeCloseTo(1_250, 8);
        });
    });

    // ── processTransactionEmission() ───────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records 4 ledger operations: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const calls: any[] = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            const types = calls.map((c) => c[0].type);
            expect(types).toContain(TransactionType.MINT);
            expect(types).toContain(TransactionType.BURN);
            expect(types.filter((t) => t === TransactionType.FEE_DISTRIBUTION)).toHaveLength(2);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const mintCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c) => c[0].type === TransactionType.MINT,
            );
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(10_000, 4);
        });

        it('BURN amount equals emitted amount (post-TX burn)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const burnCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c) => c[0].type === TransactionType.BURN,
            );
            expect(parseFloat(burnCall[0].amount)).toBeCloseTo(10_000, 4);
        });

        it('FEE_DISTRIBUTION to node pool = 75% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const feeDistCalls = mockLedgerService.recordTransaction.mock.calls.filter(
                (c) => c[0].type === TransactionType.FEE_DISTRIBUTION,
            );
            const nodeCall = feeDistCalls.find((c) =>
                c[0].recipient === 'SYSTEM_NODE_POOL_00000000000000000000',
            );
            expect(nodeCall).toBeDefined();
            expect(parseFloat(nodeCall[0].amount)).toBeCloseTo(37.5, 4);
        });

        it('FEE_DISTRIBUTION to AFC reserve = 25% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const feeDistCalls = mockLedgerService.recordTransaction.mock.calls.filter(
                (c) => c[0].type === TransactionType.FEE_DISTRIBUTION,
            );
            const afcCall = feeDistCalls.find((c) =>
                c[0].recipient === 'SYSTEM_AFC_RESERVE_000000000000000000',
            );
            expect(afcCall).toBeDefined();
            expect(parseFloat(afcCall[0].amount)).toBeCloseTo(12.5, 4);
        });

        it('commits the transaction on success', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
        });

        it('rolls back on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger error'));

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_FAIL'),
            ).rejects.toThrow('Ledger error');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('returns EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 4);
            expect(result.nodeShare).toBeCloseTo(37.5, 4);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 4);
        });
    });

    // ── AFC reserve index ───────────────────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('initial reserveIndex is 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after a transaction', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('reserveIndex is monotonically non-decreasing across multiple TXs', async () => {
            const indices: number[] = [service.getCurrentEmissionPrice()];
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(1_000, 'RECIPIENT_1', `REF_${i}`);
                indices.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < indices.length; i++) {
                expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
            }
        });

        it('reserveIndex formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 10);
        });
    });

    // ── updateCommissionRate() ──────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
            const result = service.calculate(1_000, 0.01);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws on rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate of 1 (100%)', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
