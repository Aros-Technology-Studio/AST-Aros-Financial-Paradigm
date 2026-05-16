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
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ─── calculate() — pure function ────────────────────────────────────────

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

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('node + AFC shares sum exactly to commission (no rounding loss)', () => {
            for (const amount of [1, 0.01, 99999.99, 1_000_000]) {
                const r = service.calculate(amount);
                expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
            }
        });
    });

    // ─── AFC reserve ────────────────────────────────────────────────────────

    describe('getAfcReserveState() / getCurrentEmissionPrice()', () => {
        it('starts with reserveIndex = 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
        });

        it('getCurrentEmissionPrice() returns 1.0 initially', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ─── updateCommissionRate() ──────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts valid rates in (0, 1)', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws for rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate = 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate > 1', () => {
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() — full lifecycle ──────────────────────

    describe('processTransactionEmission()', () => {
        it('calls ledger 4 times: MINT + 2×FEE_DISTRIBUTION + BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            const types = calls.map((c: any[]) => c[0].type);
            expect(types[0]).toBe(TransactionType.MINT);
            expect(types[1]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[2]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[3]).toBe(TransactionType.BURN);
        });

        it('mints and burns the same amount (1:1, net-zero supply)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_002');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            const mintAmount  = parseFloat(calls[0][0].amount);
            const burnAmount  = parseFloat(calls[3][0].amount);
            expect(mintAmount).toBeCloseTo(10_000, 6);
            expect(burnAmount).toBeCloseTo(10_000, 6);
        });

        it('routes AFC share to SYSTEM_AFC_RESERVE address', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_003');

            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.recipient).toBe('SYSTEM_AFC_RESERVE_000000000000000000');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 6);
        });

        it('routes node share to SYSTEM_NODE_POOL address', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_004');

            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.recipient).toBe('SYSTEM_NODE_POOL_00000000000000000000');
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 6);
        });

        it('grows the AFC reserve index after each emission', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_005');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('rolls back all ledger calls on failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger down'));

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_006'),
            ).rejects.toThrow('ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
