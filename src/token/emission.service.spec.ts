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
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_MOCK_HASH' }),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_MOCK_HASH' });
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculate() — canonical 1:1 model ───────────────────────────────────

    describe('calculate()', () => {
        it('enforces 1:1 emission for a $10,000 transaction', () => {
            const result = service.calculate(10_000);

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000); // 1:1
        });

        it('calculates commission at default 0.5%', () => {
            const result = service.calculate(10_000);

            expect(result.commission).toBeCloseTo(50, 8);   // 10_000 × 0.005
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);

            expect(result.nodeShare).toBeCloseTo(37.5, 8);       // 50 × 0.75
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8); // 50 × 0.25
        });

        it('node + AFC shares sum exactly to commission', () => {
            const result = service.calculate(10_000);

            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%

            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('emissionAmount always equals transactionAmount (invariant)', () => {
            for (const amount of [0.01, 1, 100, 9_999.99, 1_000_000]) {
                const r = service.calculate(amount);
                expect(r.emissionAmount).toBe(r.transactionAmount);
            }
        });
    });

    // ─── AFC reserve state ───────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts at index 1.0 with zero reserve', () => {
            const state = service.getAfcReserveState();

            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 before any transactions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ─── updateCommissionRate() governance ──────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the commission rate successfully', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws for rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() full lifecycle ─────────────────────────

    describe('processTransactionEmission()', () => {
        it('executes all four ledger steps atomically for a canonical TX', async () => {
            const result = await service.processTransactionEmission(
                10_000,
                'RECIPIENT_TEST',
                'REF_001',
            );

            // Emission result matches canonical calculation
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);

            // Four ledger entries: MINT, FEE_DISTRIBUTION×2, BURN
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            // Step 1 — MINT
            expect(mockLedgerService.recordTransaction).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    type: TransactionType.MINT,
                    recipient: 'RECIPIENT_TEST',
                    amount: '10000.00000000',
                }),
            );

            // Step 2a — 75% node pool
            expect(mockLedgerService.recordTransaction).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    type: TransactionType.FEE_DISTRIBUTION,
                    amount: '37.50000000',
                }),
            );

            // Step 2b — 25% AFC reserve
            expect(mockLedgerService.recordTransaction).toHaveBeenNthCalledWith(
                3,
                expect.objectContaining({
                    type: TransactionType.FEE_DISTRIBUTION,
                    amount: '12.50000000',
                }),
            );

            // Step 4 — BURN
            expect(mockLedgerService.recordTransaction).toHaveBeenNthCalledWith(
                4,
                expect.objectContaining({
                    type: TransactionType.BURN,
                    amount: '10000.00000000',
                }),
            );

            // Transaction committed
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('AFC reserve index rises after processing a transaction', async () => {
            const beforeIndex = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(10_000, 'REC', 'REF_002');

            const afterIndex = service.getCurrentEmissionPrice();
            expect(afterIndex).toBeGreaterThan(beforeIndex);
        });

        it('supply snapshot records mint == burn (net-zero circulating supply)', async () => {
            await service.processTransactionEmission(5_000, 'REC', 'REF_003');

            const savedSnapshot = mockQueryRunner.manager.save.mock.calls[0][1];
            expect(parseFloat(savedSnapshot.totalMinted)).toBe(5_000);
            expect(parseFloat(savedSnapshot.totalBurned)).toBe(5_000);
            expect(parseFloat(savedSnapshot.circulatingSupply)).toBe(0); // net zero
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(1_000, 'REC', 'REF_FAIL'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('always releases the query runner even on failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('fail'));

            await expect(
                service.processTransactionEmission(1_000, 'REC', 'REF_RELEASE'),
            ).rejects.toThrow();

            expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
        });
    });
});
