import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockQueryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue({}),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH_001' }),
};

const mockSupplyRepo = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
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
        mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH_001' });
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─────────────────────────────────────────────────────────────────
    // calculate() — pure function, canonical invariants
    // ─────────────────────────────────────────────────────────────────
    describe('calculate()', () => {
        it('emits 1:1 — emission equals transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission: 75% nodes, 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('works with small (dust) amounts', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBe(0.01);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // updateCommissionRate() — governance guard
    // ─────────────────────────────────────────────────────────────────
    describe('updateCommissionRate()', () => {
        it('updates rate and reflects in next calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1 (100%)', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('rejects rate above 1', () => {
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // AFC reserve state — price index
    // ─────────────────────────────────────────────────────────────────
    describe('getAfcReserveState() / getCurrentEmissionPrice()', () => {
        it('initial reserveIndex is 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('initial totalReserve is 0', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns immutable snapshot (mutations do not affect internal state)', () => {
            const state = service.getAfcReserveState() as any;
            state.totalReserve = 9_999_999;
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // processTransactionEmission() — full canonical lifecycle
    // ─────────────────────────────────────────────────────────────────
    describe('processTransactionEmission()', () => {
        it('executes all four ledger steps atomically', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first ledger call is MINT (1:1 to recipient)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            const firstCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(firstCall.type).toBe(TransactionType.MINT);
            expect(firstCall.recipient).toBe('RECIPIENT_ADDR');
            expect(parseFloat(firstCall.amount)).toBeCloseTo(10_000, 5);
        });

        it('second ledger call distributes 75% to node pool', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(nodeCall.recipient).toContain('NODE_POOL');
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 5);
        });

        it('third ledger call routes 25% to AFC reserve', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(afcCall.recipient).toContain('AFC_RESERVE');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 5);
        });

        it('fourth ledger call burns the emitted ARO (transient supply)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(burnCall.type).toBe(TransactionType.BURN);
            expect(burnCall.recipient).toContain('BURN');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 5);
        });

        it('AFC reserve grows after emission → price index rises', async () => {
            const priceBefore = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');
            const priceAfter = service.getCurrentEmissionPrice();

            expect(priceAfter).toBeGreaterThan(priceBefore);
        });

        it('reserve index is 1.0 + sqrt(totalReserve) / 10_000 after emission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expectedIndex, 10);
        });

        it('returns EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 5);
            expect(result.nodeShare).toBeCloseTo(37.5, 5);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 5);
        });

        it('commits the QueryRunner transaction on success', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_ERR'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('releases the QueryRunner regardless of success or failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('fail'));

            await service.processTransactionEmission(10_000, 'R', 'REF_FAIL').catch(() => {});

            expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
        });
    });
});
