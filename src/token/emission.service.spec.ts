import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { EmissionResult } from './emission.interfaces';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(undefined),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_MOCK_HASH' }),
};

const mockSupplyRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
};

describe('EmissionService — canonical 1:1 model', () => {
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
        mockQueryRunner.manager.save.mockResolvedValue(undefined);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_MOCK_HASH' });
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly 1:1 for a round amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('calculates default 0.5% commission correctly', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcShare === commission (no loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('works for fractional amounts (dust)', () => {
            const result = service.calculate(0.000001);
            expect(result.emissionAmount).toBe(0.000001);
            expect(result.commission).toBeCloseTo(0.000001 * 0.005, 12);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ── AFC reserve price index ───────────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('starts at reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises monotonically after each emission', async () => {
            const price0 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001');
            const price1 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(10_000, 'REC_002', 'REF_002');
            const price2 = service.getCurrentEmissionPrice();

            expect(price1).toBeGreaterThan(price0);
            expect(price2).toBeGreaterThan(price1);
        });

        it('matches formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // Single transaction: afcShare = 10_000 * 0.005 * 0.25 = 12.5
            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001');
            const expected = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 10);
        });
    });

    // ── processTransactionEmission() — ledger calls ───────────────────────────

    describe('processTransactionEmission()', () => {
        it('records exactly 4 ledger entries per TX', async () => {
            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first ledger call is a MINT to recipient (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(mintCall.type).toBe(TransactionType.MINT);
            expect(mintCall.recipient).toBe('REC_001');
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('second ledger call distributes 75% to node pool', async () => {
            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001');
            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(nodeCall.recipient).toContain('SYSTEM_NODE_POOL');
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 6);
        });

        it('third ledger call distributes 25% to AFC reserve', async () => {
            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001');
            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(afcCall.recipient).toContain('SYSTEM_AFC_RESERVE');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 6);
        });

        it('fourth ledger call is a BURN equal to emission (net-zero supply)', async () => {
            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(burnCall.type).toBe(TransactionType.BURN);
            expect(burnCall.recipient).toContain('SYSTEM_BURN_VAULT');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('rollback is called when ledger throws', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger fail'));
            await expect(
                service.processTransactionEmission(10_000, 'REC_001', 'REF_001'),
            ).rejects.toThrow('Ledger fail');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('returns EmissionResult with correct values', async () => {
            const result: EmissionResult = await service.processTransactionEmission(
                10_000, 'REC_001', 'REF_001',
            );
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });
    });

    // ── getAfcReserveState() snapshot ────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('transactionCount increments per emission', async () => {
            await service.processTransactionEmission(1_000, 'REC_001', 'REF_001');
            await service.processTransactionEmission(1_000, 'REC_002', 'REF_002');
            expect(service.getAfcReserveState().transactionCount).toBe(2);
        });

        it('totalReserve accumulates afcShare across multiple TX', async () => {
            await service.processTransactionEmission(10_000, 'REC_001', 'REF_001'); // +12.5
            await service.processTransactionEmission(10_000, 'REC_002', 'REF_002'); // +12.5
            expect(service.getAfcReserveState().totalReserve).toBeCloseTo(25, 6);
        });

        it('returns an immutable snapshot (not internal state)', async () => {
            const snap = service.getAfcReserveState() as any;
            snap.totalReserve = 999_999;
            // internal state should not change
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    // ── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and applies it to next calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(100, 8);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });
    });
});
