import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from '../../../src/token/emission.service';
import { SupplySnapshot } from '../../../src/token/entities/supply_snapshot.entity';
import { LedgerService } from '../../../src/ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockRepo       = { find: jest.fn(), save: jest.fn() };
const mockLedger     = { recordTransaction: jest.fn() };
const mockQueryRunner = {
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
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockRepo },
                { provide: LedgerService,                      useValue: mockLedger },
                { provide: DataSource,                         useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
    });

    // ─── calculate() ───────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('canonical 1:1 — emission equals transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('default commission rate is 0.5%', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBeCloseTo(0.005);
            expect(result.commission).toBeCloseTo(50);
        });

        it('fee split: 75% to nodes, 25% to AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('honours custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100);
            expect(result.nodeShare).toBeCloseTo(75);
            expect(result.afcReserveShare).toBeCloseTo(25);
        });

        it('works correctly for dust amounts', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBeCloseTo(0.00000001);
            expect(result.commission).toBeCloseTo(0.00000001 * 0.005);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ─── AFC reserve index ─────────────────────────────────────────────────────

    describe('AFC reserve index', () => {
        it('starts at 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises after updateAfcReserve()', () => {
            service.updateAfcReserve(10_000);
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });

        it('is monotonically non-decreasing across multiple contributions', () => {
            const prices: number[] = [];
            for (let i = 0; i < 5; i++) {
                service.updateAfcReserve(1_000);
                prices.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });

        it('getAfcReserveState() returns a snapshot (not live reference)', () => {
            const snap1 = service.getAfcReserveState();
            service.updateAfcReserve(5_000);
            const snap2 = service.getAfcReserveState();
            expect(snap2.totalReserve).toBeGreaterThan(snap1.totalReserve);
        });
    });

    // ─── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        beforeEach(() => {
            mockLedger.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
        });

        it('records 4 ledger entries per emission cycle (MINT, FEE×2, BURN)', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_001');
            expect(mockLedger.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(500, 'RECIPIENT', 'REF_002');
            const mintCall = mockLedger.recordTransaction.mock.calls[0][0];
            expect(mintCall.type).toBe('MINT');
            expect(parseFloat(mintCall.amount)).toBeCloseTo(500);
        });

        it('BURN amount equals emitted amount (ARO transient)', async () => {
            await service.processTransactionEmission(500, 'RECIPIENT', 'REF_003');
            const burnCall = mockLedger.recordTransaction.mock.calls[3][0];
            expect(burnCall.type).toBe('BURN');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(500);
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedger.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(100, 'RECIPIENT', 'REF_FAIL'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('returns EmissionResult with correct 1:1 amounts', async () => {
            const result = await service.processTransactionEmission(2_000, 'RECIPIENT', 'REF_004');
            expect(result.emissionAmount).toBe(2_000);
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });
    });

    // ─── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates rate and affects subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(100);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws on rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });
    });
});
