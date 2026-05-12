import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_MOCK' }),
};

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue({}),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

describe('EmissionService', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService, useValue: mockLedgerService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue({});
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_MOCK' });
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculate() — canonical 1:1 formula ─────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly the transaction amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
        });

        it('applies the default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
        });

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('handles dust amounts correctly', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeCloseTo(0.00000001 * 0.005);
        });
    });

    // ─── AFC reserve price index ──────────────────────────────────────────────

    describe('getAfcReserveState() / getCurrentEmissionPrice()', () => {
        it('starts with reserveIndex = 1.0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after a transaction emission', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_1', 'REF_1');
            const price = service.getCurrentEmissionPrice();
            expect(price).toBeGreaterThan(1.0);
        });

        it('reserveIndex is monotonically non-decreasing across multiple transactions', async () => {
            await service.processTransactionEmission(1_000, 'ADDR_1', 'REF_1');
            const p1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(1_000, 'ADDR_2', 'REF_2');
            const p2 = service.getCurrentEmissionPrice();
            expect(p2).toBeGreaterThanOrEqual(p1);
        });
    });

    // ─── processTransactionEmission() — full lifecycle ────────────────────────

    describe('processTransactionEmission()', () => {
        it('records MINT, two FEE_DISTRIBUTION, and BURN ledger entries', async () => {
            await service.processTransactionEmission(500, 'WALLET_A', 'TX_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            const types = calls.map((c: any[]) => c[0].type);

            expect(types).toContain(TransactionType.MINT);
            expect(types).toContain(TransactionType.FEE_DISTRIBUTION);
            expect(types).toContain(TransactionType.BURN);
            expect(types.filter((t: string) => t === TransactionType.FEE_DISTRIBUTION)).toHaveLength(2);
        });

        it('mints exactly the transaction amount', async () => {
            await service.processTransactionEmission(500, 'WALLET_A', 'TX_002');

            const mintCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].type === TransactionType.MINT,
            );
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(500);
        });

        it('burns exactly the emission amount', async () => {
            await service.processTransactionEmission(500, 'WALLET_A', 'TX_003');

            const burnCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].type === TransactionType.BURN,
            );
            expect(parseFloat(burnCall[0].amount)).toBeCloseTo(500);
        });

        it('routes the correct AFC share to AFC_RESERVE address', async () => {
            await service.processTransactionEmission(10_000, 'WALLET_A', 'TX_004');

            const afcCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].type === TransactionType.FEE_DISTRIBUTION &&
                    c[0].recipient === 'SYSTEM_AFC_RESERVE_000000000000000000',
            );
            expect(parseFloat(afcCall[0].amount)).toBeCloseTo(12.5);
        });

        it('routes the correct node share to NODE_POOL address', async () => {
            await service.processTransactionEmission(10_000, 'WALLET_A', 'TX_005');

            const nodeCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].type === TransactionType.FEE_DISTRIBUTION &&
                    c[0].recipient === 'SYSTEM_NODE_POOL_00000000000000000000',
            );
            expect(parseFloat(nodeCall[0].amount)).toBeCloseTo(37.5);
        });

        it('rolls back and rethrows if ledger throws', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(500, 'WALLET_A', 'TX_FAIL'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('returns EmissionResult with correct shape', async () => {
            const result = await service.processTransactionEmission(200, 'WALLET_B', 'TX_006');
            expect(result.transactionAmount).toBe(200);
            expect(result.emissionAmount).toBe(200);
            expect(result.commission).toBeCloseTo(1);
            expect(result.nodeShare).toBeCloseTo(0.75);
            expect(result.afcReserveShare).toBeCloseTo(0.25);
        });
    });

    // ─── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the commission rate and applies it in subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10);
        });

        it('throws for rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
