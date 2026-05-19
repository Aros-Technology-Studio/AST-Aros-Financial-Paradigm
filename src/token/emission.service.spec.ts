import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockSupplyRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue({}),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
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
                { provide: 'DataSource', useValue: mockDataSource },
            ],
        })
            .overrideProvider('DataSource')
            .useValue(mockDataSource)
            .compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('enforces 1:1 emission — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);       // 75%
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8); // 25%
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('handles dust amounts (0.00000001)', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeGreaterThanOrEqual(0);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ─── AFC reserve state ─────────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts with reserveIndex of 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns a read-only snapshot (mutation does not affect service state)', () => {
            const snap = service.getAfcReserveState() as any;
            snap.reserveIndex = 99;
            expect(service.getAfcReserveState().reserveIndex).toBe(1.0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 before any transactions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ─── commission rate governance ────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
        });

        it('rejects zero rate', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        beforeEach(() => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
            mockQueryRunner.manager.find.mockResolvedValue([]);
            mockQueryRunner.manager.save.mockResolvedValue({});
        });

        it('records four ledger operations in correct order', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
            const calls = mockLedgerService.recordTransaction.mock.calls;

            // Step 1: MINT 1:1 → recipient
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[0][0].recipient).toBe('RECIPIENT_1');
            expect(parseFloat(calls[0][0].amount)).toBeCloseTo(10_000, 4);

            // Step 2a: FEE_DISTRIBUTION 75% → node pool
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[1][0].recipient).toContain('NODE_POOL');
            expect(parseFloat(calls[1][0].amount)).toBeCloseTo(37.5, 4);

            // Step 2b: FEE_DISTRIBUTION 25% → AFC reserve
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].recipient).toContain('AFC_RESERVE');
            expect(parseFloat(calls[2][0].amount)).toBeCloseTo(12.5, 4);

            // Step 4: BURN emission amount
            expect(calls[3][0].type).toBe(TransactionType.BURN);
            expect(calls[3][0].recipient).toContain('BURN');
            expect(parseFloat(calls[3][0].amount)).toBeCloseTo(10_000, 4);
        });

        it('returns correct EmissionResult', async () => {
            const result = await service.processTransactionEmission(10_000, 'REC', 'REF_002');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 4);
            expect(result.nodeShare).toBeCloseTo(37.5, 4);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 4);
        });

        it('AFC reserve index grows after each transaction', async () => {
            const before = service.getAfcReserveState().reserveIndex;
            await service.processTransactionEmission(10_000, 'REC', 'REF_003');
            const after = service.getAfcReserveState().reserveIndex;
            expect(after).toBeGreaterThan(before);
        });

        it('AFC reserveIndex formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'REC', 'REF_004');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 10);
        });

        it('rolls back all ledger ops on failure', async () => {
            mockLedgerService.recordTransaction
                .mockResolvedValueOnce({ hash: 'M1' })   // MINT succeeds
                .mockResolvedValueOnce({ hash: 'F1' })   // NODE_FEE succeeds
                .mockRejectedValueOnce(new Error('DB down')); // AFC_RESERVE fails

            await expect(
                service.processTransactionEmission(1_000, 'REC', 'REF_FAIL'),
            ).rejects.toThrow('DB down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('supply snapshot net circulating supply change is zero', async () => {
            await service.processTransactionEmission(5_000, 'REC', 'REF_SNAP');
            const saved = mockQueryRunner.manager.save.mock.calls[0][1];
            // mint and burn cancel out → circulatingSupply = prev (0.0)
            expect(parseFloat(saved.circulatingSupply)).toBeCloseTo(0, 4);
            expect(parseFloat(saved.totalMinted)).toBeCloseTo(5_000, 4);
            expect(parseFloat(saved.totalBurned)).toBeCloseTo(5_000, 4);
        });
    });
});
