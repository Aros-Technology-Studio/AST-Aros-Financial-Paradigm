import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

const mockQueryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
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
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_MOCK_HASH' });
    });

    // ── calculate() ─────────────────────────────────────────────────────────────

    describe('calculate() — canonical 1:1 model', () => {
        it('emissionAmount equals transactionAmount (1:1)', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
        });

        it('commission = txAmount × 0.5% default rate', () => {
            const r = service.calculate(10_000);
            expect(r.commission).toBeCloseTo(50, 8);
        });

        it('nodeShare = commission × 75%', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare = commission × 25%', () => {
            const r = service.calculate(10_000);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 8);
        });

        it('accepts custom commission rate', () => {
            const r = service.calculate(1_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(10, 8);
            expect(r.commissionRate).toBe(0.01);
        });

        it('works for small dust amounts', () => {
            const r = service.calculate(0.01);
            expect(r.emissionAmount).toBeCloseTo(0.01, 8);
            expect(r.commission).toBeCloseTo(0.00005, 10);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ── getCurrentEmissionPrice() ────────────────────────────────────────────────

    describe('getCurrentEmissionPrice()', () => {
        it('starts at 1.0 (no reserve accumulated)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ── getAfcReserveState() ─────────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('returns initial state with zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.reserveIndex).toBe(1.0);
            expect(state.transactionCount).toBe(0);
        });
    });

    // ── updateCommissionRate() ───────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the rate used by calculate()', () => {
            service.updateCommissionRate(0.01);
            const r = service.calculate(1_000);
            expect(r.commissionRate).toBe(0.01);
            expect(r.commission).toBeCloseTo(10, 8);
        });

        it('throws if rate is 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws if rate is >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() ────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records 4 ledger entries: MINT, 2× FEE_DISTRIBUTION, BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            const types = calls.map((c: any[]) => c[0].type);
            expect(types[0]).toBe(TransactionType.MINT);
            expect(types[1]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[2]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[3]).toBe(TransactionType.BURN);
        });

        it('MINT amount equals transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_002');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('BURN amount equals emissionAmount (transient ARO destroyed)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_003');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('node pool receives 75% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_004');
            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 6);
        });

        it('AFC reserve receives 25% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_005');
            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 6);
        });

        it('AFC reserve index rises after processing', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_006');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('AFC reserve index = 1.0 + sqrt(afcShare) / 10_000 after first TX', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_007');
            const afcShare = 12.5; // 10000 * 0.005 * 0.25
            const expectedIndex = 1.0 + Math.sqrt(afcShare) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expectedIndex, 8);
        });

        it('rolls back all ledger entries on failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_ERR'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('returns EmissionResult with correct fields', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_008');
            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 6);
            expect(result.nodeShare).toBeCloseTo(37.5, 6);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 6);
        });
    });
});
