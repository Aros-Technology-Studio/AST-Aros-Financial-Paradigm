import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };

const mockLedgerService = { recordTransaction: jest.fn() };

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { find: jest.fn(), save: jest.fn() },
};

const mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };

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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_HASH' });
    });

    // ── calculate() ─────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 — emissionAmount equals transactionAmount', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
            expect(r.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const r = service.calculate(10_000);
            expect(r.commissionRate).toBeCloseTo(0.005);
            expect(r.commission).toBeCloseTo(50);
        });

        it('node share = 75% of commission', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5);
        });

        it('AFC reserve share = 25% of commission', () => {
            const r = service.calculate(10_000);
            expect(r.afcReserveShare).toBeCloseTo(12.5);
        });

        it('nodeShare + afcReserveShare === commission (no leakage)', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
        });

        it('respects custom commission rate', () => {
            const r = service.calculate(1_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(10);
            expect(r.nodeShare).toBeCloseTo(7.5);
            expect(r.afcReserveShare).toBeCloseTo(2.5);
        });

        it('handles dust amounts without error', () => {
            const r = service.calculate(0.000001);
            expect(r.emissionAmount).toBeCloseTo(0.000001);
            expect(r.commission).toBeGreaterThan(0);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ── getAfcReserveState() ─────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('returns initial state with index = 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.reserveIndex).toBe(1.0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns a copy — mutations do not affect internal state', () => {
            const state = service.getAfcReserveState() as any;
            state.totalReserve = 999_999;
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    // ── getCurrentEmissionPrice() ────────────────────────────────────────────

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 before any emissions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and applies it', () => {
            service.updateCommissionRate(0.01);
            const r = service.calculate(1_000);
            expect(r.commissionRate).toBeCloseTo(0.01);
        });

        it('rejects rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() ────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records MINT → FEE_DISTRIBUTION (×2) → BURN in order', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls.length).toBe(4);
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('MINT amount equals transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT_2', 'REF_002');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(5_000);
        });

        it('BURN amount equals emissionAmount (full burn after TX)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT_3', 'REF_003');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(5_000);
        });

        it('node fee goes to SYSTEM_NODE_POOL address', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_4', 'REF_004');
            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.recipient).toBe('SYSTEM_NODE_POOL_00000000000000000000');
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5);
        });

        it('AFC share goes to SYSTEM_AFC_RESERVE address', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_5', 'REF_005');
            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.recipient).toBe('SYSTEM_AFC_RESERVE_000000000000000000');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5);
        });

        it('AFC reserve index rises after each emission', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_6', 'REF_006');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('rolls back if ledger fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('DB down'));
            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_7', 'REF_007'),
            ).rejects.toThrow('DB down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
