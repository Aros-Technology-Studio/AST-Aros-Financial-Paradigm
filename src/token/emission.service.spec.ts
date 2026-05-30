import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };

const mockLedgerService = { recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }) };

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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ── calculate() ────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 (emissionAmount === transactionAmount)', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
            expect(r.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const r = service.calculate(10_000);
            expect(r.commissionRate).toBe(0.005);
            expect(r.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 8);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 8);
        });

        it('honours a custom commission rate', () => {
            const r = service.calculate(1_000, 0.01); // 1%
            expect(r.commissionRate).toBe(0.01);
            expect(r.commission).toBeCloseTo(10, 8);
            expect(r.nodeShare).toBeCloseTo(7.5, 8);
            expect(r.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('handles dust amounts without error', () => {
            const r = service.calculate(0.000001);
            expect(r.emissionAmount).toBe(0.000001);
            expect(r.commission).toBeCloseTo(0.000001 * 0.005, 12);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ── AFC reserve state ───────────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts with reserveIndex 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns an immutable snapshot (mutation does not affect internal state)', () => {
            const state = service.getAfcReserveState() as any;
            state.totalReserve = 999_999;
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 before any transactions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ── updateCommissionRate() ─────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and subsequent calculate() uses it', () => {
            service.updateCommissionRate(0.02);
            const r = service.calculate(1_000);
            expect(r.commissionRate).toBe(0.02);
            expect(r.commission).toBeCloseTo(20, 8);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1 (100%)', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('rejects negative rate', () => {
            expect(() => service.updateCommissionRate(-0.01)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() ────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records 4 ledger entries per canonical lifecycle', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');
            // MINT, FEE_DISTRIBUTION (nodes), FEE_DISTRIBUTION (AFC), BURN
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first ledger entry is a MINT for emissionAmount', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');
            const firstCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(firstCall.type).toBe(TransactionType.MINT);
            expect(parseFloat(firstCall.amount)).toBeCloseTo(10_000, 4);
            expect(firstCall.recipient).toBe('RECIPIENT_A');
        });

        it('last ledger entry is a BURN for emissionAmount (transient ARO)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');
            const lastCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(lastCall.type).toBe(TransactionType.BURN);
            expect(parseFloat(lastCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('AFC reserve index rises after a transaction', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('AFC reserve index follows canonical sqrt formula', async () => {
            // 10,000 ARO × 0.5% = 50 commission → 25% AFC = 12.5 ARO
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');
            const expectedIndex = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expectedIndex, 8);
        });

        it('rolls back all ledger entries when one fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger failure'));
            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_B', 'REF_FAIL'),
            ).rejects.toThrow('ledger failure');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
