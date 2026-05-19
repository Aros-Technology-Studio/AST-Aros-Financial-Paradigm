import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
    },
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
                { provide: 'DataSource', useValue: mockDataSource },
            ],
        })
            .overrideProvider('DataSource')
            .useValue(mockDataSource)
            .compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    // ── calculate() ───────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 to transaction amount', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
            expect(r.transactionAmount).toBe(10_000);
        });

        it('applies 0.5% default commission rate', () => {
            const r = service.calculate(10_000);
            expect(r.commissionRate).toBeCloseTo(0.005);
            expect(r.commission).toBeCloseTo(50);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5);       // 50 × 0.75
            expect(r.afcReserveShare).toBeCloseTo(12.5); // 50 × 0.25
        });

        it('node + AFC shares sum to total commission', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission);
        });

        it('accepts a custom commission rate', () => {
            const r = service.calculate(1_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(10);
            expect(r.nodeShare).toBeCloseTo(7.5);
            expect(r.afcReserveShare).toBeCloseTo(2.5);
        });

        it('throws on non-positive amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts correctly', () => {
            const r = service.calculate(0.01);
            expect(r.emissionAmount).toBeCloseTo(0.01);
            expect(r.commission).toBeCloseTo(0.00005);
        });
    });

    // ── AFC reserve index ─────────────────────────────────────────────────────

    describe('AFC reserve index', () => {
        it('starts at 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises monotonically as reserve accumulates', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({});
            mockQueryRunner.manager.find.mockResolvedValue([]);

            await service.processTransactionEmission(1_000, 'RECIPIENT_A', 'REF_1');
            const idx1 = service.getCurrentEmissionPrice();
            expect(idx1).toBeGreaterThan(1.0);

            await service.processTransactionEmission(1_000, 'RECIPIENT_B', 'REF_2');
            const idx2 = service.getCurrentEmissionPrice();
            expect(idx2).toBeGreaterThan(idx1);
        });

        it('reserveIndex = 1.0 + sqrt(totalReserve) / 10_000', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({});
            // AFC share of one $10,000 TX at 0.5% = 10_000 * 0.005 * 0.25 = 12.5
            await service.processTransactionEmission(10_000, 'REC', 'REF_IDX');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected);
        });
    });

    // ── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        beforeEach(() => {
            mockLedgerService.recordTransaction.mockResolvedValue({});
        });

        it('records 4 ledger operations in order: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(5_000, 'REC', 'TX_ORDER');
            const calls = mockLedgerService.recordTransaction.mock.calls.map(c => c[0].type);
            expect(calls).toEqual([
                TransactionType.MINT,
                TransactionType.FEE_DISTRIBUTION,
                TransactionType.FEE_DISTRIBUTION,
                TransactionType.BURN,
            ]);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(7_500, 'REC', 'TX_1_1');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(7_500);
        });

        it('BURN amount equals emitted amount (transient tokens)', async () => {
            await service.processTransactionEmission(7_500, 'REC', 'TX_BURN');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(7_500);
        });

        it('rolls back all ledger ops if any step fails', async () => {
            mockLedgerService.recordTransaction
                .mockResolvedValueOnce({})   // MINT ok
                .mockRejectedValueOnce(new Error('ledger error')); // FEE fails

            await expect(
                service.processTransactionEmission(1_000, 'REC', 'TX_FAIL'),
            ).rejects.toThrow('ledger error');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('supply snapshot: totalMinted and totalBurned both increase by emissionAmount', async () => {
            await service.processTransactionEmission(2_000, 'REC', 'TX_SNAP');
            const snapSave = mockQueryRunner.manager.save.mock.calls[0];
            const snap = snapSave[1]; // (entity, instance)
            expect(parseFloat(snap.totalMinted)).toBeCloseTo(2_000);
            expect(parseFloat(snap.totalBurned)).toBeCloseTo(2_000);
            // circulatingSupply unchanged (net zero)
            expect(parseFloat(snap.circulatingSupply)).toBeCloseTo(0);
        });
    });

    // ── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and applies it', () => {
            service.updateCommissionRate(0.01);
            const r = service.calculate(1_000);
            expect(r.commission).toBeCloseTo(10);
        });

        it('rejects rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
