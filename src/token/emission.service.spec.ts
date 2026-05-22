import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
};

const mockQueryRunner = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(undefined),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('EmissionService — Canonical 1:1 Model', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService,                      useValue: mockLedgerService },
                { provide: DataSource,                         useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        // Restore default QueryRunner mock after clearAllMocks
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue(undefined);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_TX_HASH' });
        mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('should emit exactly 1:1 for the transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('should apply default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBeCloseTo(0.005);
            expect(result.commission).toBeCloseTo(50); // 10_000 × 0.005
        });

        it('should split commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);     // 50 × 0.75
            expect(result.afcReserveShare).toBeCloseTo(12.5); // 50 × 0.25
        });

        it('nodeShare + afcReserveShare must equal total commission (invariant)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('should accept a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commissionRate).toBeCloseTo(0.01);
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('should handle dust amounts correctly', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBeCloseTo(0.00000001);
            expect(result.commission).toBeGreaterThanOrEqual(0);
        });

        it('should throw BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ── AFC Reserve ───────────────────────────────────────────────────────────

    describe('AFC reserve state', () => {
        it('should start at reserveIndex 1.0 (no reserve)', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBeCloseTo(1.0);
            expect(state.totalReserve).toBe(0);
        });

        it('getCurrentEmissionPrice() should equal reserveIndex initially', () => {
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(1.0);
        });
    });

    // ── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('should update rate for subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBeCloseTo(0.01);
        });

        it('should throw for rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('should throw for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('should throw for negative rate', () => {
            expect(() => service.updateCommissionRate(-0.01)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        const TX_AMOUNT    = 10_000;
        const RECIPIENT    = 'WALLET_TEST_0001';
        const REFERENCE_ID = 'TX_REF_00001';

        it('should call ledger MINT with 1:1 emission amount', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            const mintCall = mockLedgerService.recordTransaction.mock.calls.find(
                ([args]) => args.type === TransactionType.MINT,
            );
            expect(mintCall).toBeDefined();
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(TX_AMOUNT);
        });

        it('should call ledger FEE_DISTRIBUTION twice (nodes + AFC)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            const feeCalls = mockLedgerService.recordTransaction.mock.calls.filter(
                ([args]) => args.type === TransactionType.FEE_DISTRIBUTION,
            );
            expect(feeCalls.length).toBe(2);
        });

        it('should call ledger BURN with same amount as emission', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            const burnCall = mockLedgerService.recordTransaction.mock.calls.find(
                ([args]) => args.type === TransactionType.BURN,
            );
            expect(burnCall).toBeDefined();
            expect(parseFloat(burnCall[0].amount)).toBeCloseTo(TX_AMOUNT);
        });

        it('should commit the transaction on success', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('should rollback and rethrow on ledger error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('should return EmissionResult matching calculate() output', async () => {
            const expected = service.calculate(TX_AMOUNT);
            const actual   = await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);

            expect(actual.emissionAmount).toBeCloseTo(expected.emissionAmount);
            expect(actual.commission).toBeCloseTo(expected.commission);
            expect(actual.nodeShare).toBeCloseTo(expected.nodeShare);
            expect(actual.afcReserveShare).toBeCloseTo(expected.afcReserveShare);
        });

        it('full $10k example: emission=10000, fee=50, nodes=37.5, AFC=12.5', async () => {
            const result = await service.processTransactionEmission(10_000, RECIPIENT, REFERENCE_ID);
            expect(result.emissionAmount).toBeCloseTo(10_000);
            expect(result.commission).toBeCloseTo(50);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
        });
    });
});
