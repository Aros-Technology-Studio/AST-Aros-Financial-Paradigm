import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo  = { find: jest.fn(), save: jest.fn() };
const mockLedgerService = { recordTransaction: jest.fn().mockResolvedValue({}) };
const mockQueryRunner  = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
    manager: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
};
const mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };

describe('EmissionService', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService,                       useValue: mockLedgerService },
                { provide: DataSource,                          useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly the transaction amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('routes 75% of commission to node pool', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('routes 25% of commission to AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('handles dust amounts without losing the 75/25 invariant', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 15);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });
    });

    // ── AFC reserve state ─────────────────────────────────────────────────────

    describe('AFC reserve state', () => {
        it('starts at reserveIndex 1.0', () => {
            expect(service.getAfcReserveState().reserveIndex).toBe(1.0);
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });

        it('getCurrentEmissionPrice() returns reserveIndex', () => {
            expect(service.getCurrentEmissionPrice()).toBe(service.getAfcReserveState().reserveIndex);
        });
    });

    // ── syncEpochAfcContribution() ────────────────────────────────────────────

    describe('syncEpochAfcContribution()', () => {
        it('grows reserveIndex after epoch AFC sync', () => {
            const before = service.getCurrentEmissionPrice();
            service.syncEpochAfcContribution(12.5);
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('applies sqrt formula: 1.0 + sqrt(totalReserve) / 10_000', () => {
            service.syncEpochAfcContribution(10_000);
            const expected = 1.0 + Math.sqrt(10_000) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 10);
        });

        it('is monotonically non-decreasing across multiple contributions', () => {
            const prices: number[] = [service.getCurrentEmissionPrice()];
            [100, 200, 500, 1000].forEach(amt => {
                service.syncEpochAfcContribution(amt);
                prices.push(service.getCurrentEmissionPrice());
            });
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });

        it('ignores zero or negative contributions', () => {
            const before = service.getAfcReserveState().totalReserve;
            service.syncEpochAfcContribution(0);
            service.syncEpochAfcContribution(-50);
            expect(service.getAfcReserveState().totalReserve).toBe(before);
        });
    });

    // ── processTransactionEmission() happy path ───────────────────────────────

    describe('processTransactionEmission()', () => {
        it('executes four ledger steps and returns the emission result', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({});

            const result = await service.processTransactionEmission(1_000, 'RECIPIENT_1', 'REF_001');

            expect(result.emissionAmount).toBe(1_000);
            expect(result.commission).toBeCloseTo(5, 8);
            // MINT + FEE_DISTRIBUTION×2 + BURN = 4 calls
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and re-throws on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValue(new Error('DB error'));

            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT_1', 'REF_002'),
            ).rejects.toThrow('DB error');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });
    });

    // ── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('changes the default rate used by calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });
    });
});
