import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockLedgerService = {
    recordTransaction: jest.fn(),
};

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_MOCK' });
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ───────────────────────────────────────────────────────────────────
    // calculate() — pure function, canonical invariants
    // ───────────────────────────────────────────────────────────────────
    describe('calculate()', () => {
        it('canonical 1:1: emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
        });

        it('commission = transactionAmount × default rate (0.5%)', () => {
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

        it('invariant: nodeShare + afcReserveShare === commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('respects custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('handles dust amounts (0.00000001)', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBeCloseTo(0.00000001, 10);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('handles large amounts (1,000,000,000)', () => {
            const result = service.calculate(1_000_000_000);
            expect(result.emissionAmount).toBe(1_000_000_000);
            expect(result.commission).toBeCloseTo(5_000_000, 4);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // AFC reserve price index
    // ───────────────────────────────────────────────────────────────────
    describe('getCurrentEmissionPrice()', () => {
        it('starts at 1.0 (no reserve yet)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises after syncEpochAfcContribution()', () => {
            service.syncEpochAfcContribution(10_000);
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });

        it('is monotonically non-decreasing', () => {
            const prices: number[] = [];
            for (let i = 0; i < 5; i++) {
                service.syncEpochAfcContribution(1_000);
                prices.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });

        it('follows formula: 1.0 + sqrt(totalReserve) / 10_000', () => {
            service.syncEpochAfcContribution(10_000);
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 8);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // syncEpochAfcContribution()
    // ───────────────────────────────────────────────────────────────────
    describe('syncEpochAfcContribution()', () => {
        it('ignores zero or negative amounts', () => {
            const before = service.getAfcReserveState().totalReserve;
            service.syncEpochAfcContribution(0);
            service.syncEpochAfcContribution(-5);
            expect(service.getAfcReserveState().totalReserve).toBe(before);
        });

        it('accumulates reserve correctly across multiple calls', () => {
            service.syncEpochAfcContribution(100);
            service.syncEpochAfcContribution(200);
            expect(service.getAfcReserveState().totalReserve).toBeCloseTo(300, 8);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // processTransactionEmission() — integration-style (mocked ledger)
    // ───────────────────────────────────────────────────────────────────
    describe('processTransactionEmission()', () => {
        const TX_AMOUNT = 10_000;
        const RECIPIENT = 'ADDR_TEST_000000000000000';
        const REF_ID    = 'REF_TEST_001';

        it('calls ledger MINT, two FEE_DISTRIBUTION, and BURN — in that order', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID);

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('MINT amount equals transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID);
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(TX_AMOUNT, 4);
        });

        it('BURN amount equals emitted amount (canonical burn)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID);
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(TX_AMOUNT, 4);
        });

        it('node FEE_DISTRIBUTION is 75% of commission', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID);
            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            const expected = TX_AMOUNT * 0.005 * 0.75;
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(expected, 4);
        });

        it('AFC FEE_DISTRIBUTION is 25% of commission', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID);
            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            const expected = TX_AMOUNT * 0.005 * 0.25;
            expect(parseFloat(afcCall.amount)).toBeCloseTo(expected, 4);
        });

        it('commits the query runner transaction on success', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('updates AFC reserve index after successful emission', async () => {
            const beforeIndex = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REF_ID);
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(beforeIndex);
        });

        it('throws BadRequestException for zero transaction amount', async () => {
            await expect(
                service.processTransactionEmission(0, RECIPIENT, REF_ID),
            ).rejects.toThrow(BadRequestException);
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // updateCommissionRate()
    // ───────────────────────────────────────────────────────────────────
    describe('updateCommissionRate()', () => {
        it('new rate is reflected in subsequent calculate() calls', () => {
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
