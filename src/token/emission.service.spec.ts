import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

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
        save: jest.fn(),
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

    // ──────────────────────────────────────────────────────
    // calculate() — pure function, no side effects
    // ──────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 — emission equals transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies 0.5% default commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('node + AFC shares sum to total commission exactly', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.nodeShare).toBeCloseTo(75, 8);
            expect(result.afcReserveShare).toBeCloseTo(25, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('works correctly for dust amounts (0.000001)', () => {
            const result = service.calculate(0.000001);
            expect(result.emissionAmount).toBe(0.000001);
            expect(result.commission).toBeCloseTo(0.000001 * 0.005, 15);
        });

        it('works correctly for large amounts (10,000,000)', () => {
            const result = service.calculate(10_000_000);
            expect(result.emissionAmount).toBe(10_000_000);
            expect(result.commission).toBeCloseTo(50_000, 8);
            expect(result.nodeShare).toBeCloseTo(37_500, 8);
            expect(result.afcReserveShare).toBeCloseTo(12_500, 8);
        });
    });

    // ──────────────────────────────────────────────────────
    // AFC reserve state
    // ──────────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('initialises with reserveIndex = 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns a copy — mutations do not affect internal state', () => {
            const state = service.getAfcReserveState() as any;
            state.totalReserve = 9999;
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 before any transactions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ──────────────────────────────────────────────────────
    // updateCommissionRate()
    // ──────────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the rate and subsequent calculate() uses the new rate', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(100, 8);
        });

        it('throws BadRequestException for rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ──────────────────────────────────────────────────────
    // processTransactionEmission() — full lifecycle
    // ──────────────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records four ledger entries atomically (MINT, FEE×2, BURN)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_001');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first ledger call is MINT of the full emission amount', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_001');
            const firstCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(firstCall.type).toBe('MINT');
            expect(parseFloat(firstCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('last ledger call is BURN of the full emission amount (post-TX burn)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_001');
            const lastCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(lastCall.type).toBe('BURN');
            expect(parseFloat(lastCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('commits the QueryRunner transaction on success', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT_B', 'TX_REF_002');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT_C', 'TX_REF_003'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('grows AFC reserve after each emission', async () => {
            await service.processTransactionEmission(10_000, 'ADDR', 'TX_1');
            const state = service.getAfcReserveState();
            // afcShare = 10000 * 0.005 * 0.25 = 12.5
            expect(state.totalReserve).toBeCloseTo(12.5, 4);
            expect(state.transactionCount).toBe(1);
        });

        it('reserveIndex rises monotonically after multiple emissions', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'ADDR', 'TX_A');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);

            await service.processTransactionEmission(10_000, 'ADDR', 'TX_B');
            const after2 = service.getCurrentEmissionPrice();
            expect(after2).toBeGreaterThan(after);
        });

        it('returns the EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(10_000, 'ADDR', 'TX_RET');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 4);
            expect(result.nodeShare).toBeCloseTo(37.5, 4);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 4);
        });
    });

    // ──────────────────────────────────────────────────────
    // Canonical invariants (integration-style checks)
    // ──────────────────────────────────────────────────────

    describe('Canonical invariants', () => {
        it('INV-1: emissionAmount === transactionAmount for any positive input', () => {
            for (const amount of [1, 100, 9999.99, 1_000_000]) {
                const r = service.calculate(amount);
                expect(r.emissionAmount).toBe(r.transactionAmount);
            }
        });

        it('INV-2: nodeShare + afcShare === commission (no rounding loss)', () => {
            for (const amount of [0.01, 1, 777, 10_000]) {
                const r = service.calculate(amount);
                expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
            }
        });

        it('INV-3: reserveIndex is monotonically non-decreasing across multiple TXs', async () => {
            let prev = service.getCurrentEmissionPrice();
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(1_000, 'ADDR', `TX_INV3_${i}`);
                const curr = service.getCurrentEmissionPrice();
                expect(curr).toBeGreaterThanOrEqual(prev);
                prev = curr;
            }
        });
    });
});
