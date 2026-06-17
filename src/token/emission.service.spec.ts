import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

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
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn(),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_TX_HASH' });
    });

    // ─── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 — emission equals transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('uses 0.5% default commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);    // 50 × 0.75
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8); // 50 × 0.25
        });

        it('nodeShare + afcReserveShare equals total commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('respects a custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws for negative amount', () => {
            expect(() => service.calculate(-1)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records mint, two fee-distribution records, then burn — in that order', async () => {
            await service.processTransactionEmission(10_000, 'WALLET_A', 'TX_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[0][0].amount).toBe('10000.00000000');

            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[1][0].metadata.operation).toBe('NODE_FEE_75PCT');

            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].metadata.operation).toBe('AFC_RESERVE_25PCT');

            expect(calls[3][0].type).toBe(TransactionType.BURN);
            expect(calls[3][0].amount).toBe('10000.00000000'); // burn equals emission
        });

        it('burn amount equals mint amount (net-zero circulating supply)', async () => {
            await service.processTransactionEmission(7_500, 'WALLET_B', 'TX_002');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            const mintAmt = calls[0][0].amount;
            const burnAmt = calls[3][0].amount;
            expect(mintAmt).toBe(burnAmt);
        });

        it('AFC reserve index rises monotonically across transactions', async () => {
            const price0 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(1_000, 'W1', 'TX_A');
            const price1 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(1_000, 'W2', 'TX_B');
            const price2 = service.getCurrentEmissionPrice();

            expect(price1).toBeGreaterThan(price0);
            expect(price2).toBeGreaterThan(price1);
        });

        it('commits the DB transaction on success', async () => {
            await service.processTransactionEmission(500, 'WALLET_C', 'TX_003');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back the DB transaction on ledger error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(500, 'WALLET_D', 'TX_004'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('returns an EmissionResult with all canonical fields populated', async () => {
            const result = await service.processTransactionEmission(10_000, 'WALLET_E', 'TX_005');

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });
    });

    // ─── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the rate used in subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(100, 8);
        });

        it('rejects rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(-0.1)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ─── getAfcReserveState() ──────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts at index 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns an immutable snapshot (mutations do not affect internal state)', async () => {
            await service.processTransactionEmission(1_000, 'W3', 'TX_IMM');
            const snap = service.getAfcReserveState() as any;
            const indexBefore = snap.reserveIndex;
            snap.reserveIndex = 999; // attempt mutation
            expect(service.getCurrentEmissionPrice()).toBe(indexBefore);
        });
    });
});
