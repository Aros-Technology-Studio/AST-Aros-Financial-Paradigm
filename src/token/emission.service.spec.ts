import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRecordTransaction = jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' });

const mockLedgerService = {
    recordTransaction: mockRecordTransaction,
};

const mockQueryRunner = {
    connect:             jest.fn().mockResolvedValue(undefined),
    startTransaction:    jest.fn().mockResolvedValue(undefined),
    commitTransaction:   jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release:             jest.fn().mockResolvedValue(undefined),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(undefined),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockSupplyRepo = {};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('EmissionService', () => {
    let service: EmissionService;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService, useValue: mockLedgerService },
                { provide: DataSource,    useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ── calculate() ────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('returns 1:1 emission equal to transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies 0.5% default commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC (canonical model)', () => {
            const result = service.calculate(10_000);
            // node pool = 50 × 0.75 = 37.50
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            // AFC reserve = 50 × 0.25 = 12.50
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare == commission (no value lost)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('respects a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() ────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        const TX_AMOUNT   = 1_000;
        const RECIPIENT   = 'WALLET_RECIPIENT_001';
        const REFERENCE   = 'REF_TX_001';

        it('records MINT → FEE_DISTRIBUTION × 2 → BURN in order', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);

            const calls = mockRecordTransaction.mock.calls;
            expect(calls).toHaveLength(4);
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            const mintCall = mockRecordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(TX_AMOUNT, 8);
        });

        it('BURN amount equals emitted amount (ARO are transient)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            const burnCall = mockRecordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(TX_AMOUNT, 8);
        });

        it('FEE_DISTRIBUTION to NODE_POOL is 75% of commission', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            const nodeCall = mockRecordTransaction.mock.calls[1][0];
            // commission = 1000 × 0.005 = 5; node = 5 × 0.75 = 3.75
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(3.75, 8);
        });

        it('FEE_DISTRIBUTION to AFC_RESERVE is 25% of commission', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            const afcCall = mockRecordTransaction.mock.calls[2][0];
            // commission = 5; AFC = 5 × 0.25 = 1.25
            expect(parseFloat(afcCall.amount)).toBeCloseTo(1.25, 8);
        });

        it('commits the QueryRunner on success', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockRecordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('returns EmissionResult with correct fields', async () => {
            const result = await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            expect(result.transactionAmount).toBe(TX_AMOUNT);
            expect(result.emissionAmount).toBe(TX_AMOUNT);
            expect(result.commissionRate).toBe(0.005);
        });
    });

    // ── AFC Reserve / price index ───────────────────────────────────────────────

    describe('AFC reserve and emission price', () => {
        it('starts with reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after emission (AFC reserve accumulates)', async () => {
            const priceBefore = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'WALLET_A', 'TX_A');
            const priceAfter = service.getCurrentEmissionPrice();
            expect(priceAfter).toBeGreaterThan(priceBefore);
        });

        it('reserveIndex follows formula: 1.0 + sqrt(reserve) / 10_000', async () => {
            // AFC share for 10_000 tx at 0.5% = 12.50
            await service.processTransactionEmission(10_000, 'WALLET_B', 'TX_B');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 10);
        });

        it('reserveIndex is monotonically non-decreasing across multiple transactions', async () => {
            const prices: number[] = [service.getCurrentEmissionPrice()];
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(5_000, `WALLET_${i}`, `TX_${i}`);
                prices.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });

        it('getAfcReserveState() returns immutable snapshot (not live reference)', async () => {
            const snap1 = service.getAfcReserveState();
            await service.processTransactionEmission(1_000, 'WALLET_C', 'TX_C');
            const snap2 = service.getAfcReserveState();
            expect(snap1.totalReserve).not.toBe(snap2.totalReserve);
        });
    });

    // ── updateCommissionRate() ──────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and applies it to subsequent emissions', () => {
            service.updateCommissionRate(0.01); // 1%
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('rejects rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate = 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('rejects negative rate', () => {
            expect(() => service.updateCommissionRate(-0.1)).toThrow(BadRequestException);
        });
    });
});
