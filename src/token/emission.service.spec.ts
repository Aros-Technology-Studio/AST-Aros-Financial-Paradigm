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
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_MOCK' }),
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
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculate() — pure function ────────────────────────────────────────

    describe('calculate()', () => {
        it('emission equals transaction amount (1:1 invariant)', () => {
            for (const amount of [1, 100, 10_000, 1_000_000]) {
                const r = service.calculate(amount);
                expect(r.emissionAmount).toBe(amount);
                expect(r.transactionAmount).toBe(amount);
            }
        });

        it('applies default 0.5% commission rate', () => {
            const r = service.calculate(10_000);
            expect(r.commissionRate).toBe(0.005);
            expect(r.commission).toBeCloseTo(50, 9);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 9);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 9);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            for (const amount of [100, 500, 1234.56, 99_999]) {
                const r = service.calculate(amount);
                expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 9);
            }
        });

        it('accepts a custom commission rate', () => {
            const r = service.calculate(1_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(10, 9);
            expect(r.nodeShare).toBeCloseTo(7.5, 9);
            expect(r.afcReserveShare).toBeCloseTo(2.5, 9);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('canonical $10,000 example matches spec', () => {
            const r = service.calculate(10_000);
            // TX Amount = 10,000 ARO
            expect(r.emissionAmount).toBe(10_000);
            // Commission = 10,000 × 0.005 = 50 ARO
            expect(r.commission).toBeCloseTo(50, 9);
            // Node pool  = 50 × 0.75 = 37.50 ARO
            expect(r.nodeShare).toBeCloseTo(37.5, 9);
            // AFC reserve = 50 × 0.25 = 12.50 ARO
            expect(r.afcReserveShare).toBeCloseTo(12.5, 9);
        });
    });

    // ─── AFC reserve state ───────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts with index 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns a copy, not the internal object', () => {
            const a = service.getAfcReserveState();
            const b = service.getAfcReserveState();
            expect(a).not.toBe(b);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 initially', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ─── updateCommissionRate() ──────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the commission rate used in calculate()', () => {
            service.updateCommissionRate(0.01);
            const r = service.calculate(1_000);
            expect(r.commissionRate).toBe(0.01);
            expect(r.commission).toBeCloseTo(10, 9);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() ───────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('returns correct EmissionResult for canonical amount', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 9);
            expect(result.nodeShare).toBeCloseTo(37.5, 9);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 9);
        });

        it('records exactly 4 ledger operations (MINT, 2×FEE_DIST, BURN)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT_B', 'REF_002');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('AFC reserve index grows after processing a transaction', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_C', 'REF_003');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('AFC reserve index = 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // After one $10k TX: afcShare = 12.5 ARO
            await service.processTransactionEmission(10_000, 'RECIPIENT_D', 'REF_004');
            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expectedIndex, 12);
        });

        it('rolls back on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger unavailable'));
            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT_E', 'REF_005'),
            ).rejects.toThrow('Ledger unavailable');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('commits transaction on success', async () => {
            await service.processTransactionEmission(500, 'RECIPIENT_F', 'REF_006');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        });

        it('always releases the query runner', async () => {
            await service.processTransactionEmission(500, 'RECIPIENT_G', 'REF_007');
            expect(mockQueryRunner.release).toHaveBeenCalled();
        });

        it('releases query runner even after failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Oops'));
            await expect(
                service.processTransactionEmission(100, 'RECIPIENT_H', 'REF_008'),
            ).rejects.toThrow();
            expect(mockQueryRunner.release).toHaveBeenCalled();
        });
    });
});
