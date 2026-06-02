import { BadRequestException } from '@nestjs/common';
import { EmissionService } from '../../../src/token/emission.service';

// Minimal stubs — EmissionService only uses these in processTransactionEmission,
// not in calculate() which is the pure function under test here.
const mockSupplyRepo  = { find: jest.fn(), save: jest.fn() };
const mockLedgerSvc   = { recordTransaction: jest.fn().mockResolvedValue({}) };
const mockQueryRunner = {
    connect: jest.fn(), startTransaction: jest.fn(),
    commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
};
const mockDataSource  = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };

function buildService(): EmissionService {
    return new EmissionService(
        mockSupplyRepo as any,
        mockLedgerSvc as any,
        mockDataSource as any,
    );
}

describe('EmissionService — canonical 1:1 model', () => {
    let svc: EmissionService;

    beforeEach(() => {
        svc = buildService();
        jest.clearAllMocks();
    });

    // ── calculate() ─────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly 1:1 with transaction amount', () => {
            const r = svc.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
            expect(r.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const r = svc.calculate(10_000);
            expect(r.commission).toBeCloseTo(50, 8);
            expect(r.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC (canonical)', () => {
            const r = svc.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 8);     // 50 × 0.75
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8); // 50 × 0.25
        });

        it('node + AFC shares sum to commission exactly', () => {
            const r = svc.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
        });

        it('respects a custom commission rate', () => {
            const r = svc.calculate(1_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(10, 8);
            expect(r.nodeShare).toBeCloseTo(7.5, 8);
            expect(r.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('handles small (dust) amounts without error', () => {
            const r = svc.calculate(0.000001);
            expect(r.emissionAmount).toBe(0.000001);
            expect(r.commission).toBeGreaterThan(0);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => svc.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => svc.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ── AFC reserve index ────────────────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('starts at 1.0 (no reserve)', () => {
            expect(svc.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises monotonically as reserve accumulates', () => {
            svc.updateAfcReserve(12.5);
            const p1 = svc.getCurrentEmissionPrice();
            svc.updateAfcReserve(12.5);
            const p2 = svc.getCurrentEmissionPrice();
            expect(p2).toBeGreaterThan(p1);
        });

        it('follows sqrt formula: 1.0 + sqrt(total) / 10_000', () => {
            svc.updateAfcReserve(10_000);
            // reserveIndex = 1 + sqrt(10_000)/10_000 = 1 + 100/10_000 = 1.01
            expect(svc.getCurrentEmissionPrice()).toBeCloseTo(1.01, 6);
        });

        it('getAfcReserveState reflects accumulated reserve', () => {
            svc.updateAfcReserve(100);
            svc.updateAfcReserve(50);
            const state = svc.getAfcReserveState();
            expect(state.totalReserve).toBe(150);
            expect(state.transactionCount).toBe(2);
        });
    });

    // ── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('changes the default rate for subsequent calculations', () => {
            svc.updateCommissionRate(0.01);
            const r = svc.calculate(1_000);
            expect(r.commissionRate).toBe(0.01);
            expect(r.commission).toBeCloseTo(10, 8);
        });

        it('rejects rate of 0', () => {
            expect(() => svc.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => svc.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
