import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn().mockResolvedValue([]),
};

const mockQueryRunner = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
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
                { provide: 'DataSource', useValue: mockDataSource },
            ],
        })
            .overrideProvider('DataSource')
            .useValue(mockDataSource)
            .compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_TX_HASH' });
    });

    // ─── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('enforces 1:1 emission — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('calculates commission at default 0.5%', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare equals total commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('respects custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.nodeShare).toBeCloseTo(75, 8);
            expect(result.afcReserveShare).toBeCloseTo(25, 8);
        });

        it('works for small (dust) amounts', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBe(0.01);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });

        it('works for large amounts', () => {
            const result = service.calculate(1_000_000);
            expect(result.emissionAmount).toBe(1_000_000);
            expect(result.commission).toBeCloseTo(5_000, 8);
            expect(result.nodeShare).toBeCloseTo(3_750, 8);
            expect(result.afcReserveShare).toBeCloseTo(1_250, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ─── AFC reserve state ────────────────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('starts at reserveIndex 1.0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
        });

        it('getCurrentEmissionPrice() returns reserveIndex', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ─── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
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

    // ─── processTransactionEmission() ────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        const setupDataSource = () => {
            // Inject dataSource mock via internal reference
            (service as any).dataSource = mockDataSource;
        };

        beforeEach(setupDataSource);

        it('records MINT, two FEE_DISTRIBUTION, and BURN ledger entries', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_A', 'REF_001');

            const calls: any[] = mockLedgerService.recordTransaction.mock.calls;
            const types = calls.map((c) => c[0].type);

            expect(types).toContain(TransactionType.MINT);
            expect(types).toContain(TransactionType.FEE_DISTRIBUTION);
            expect(types).toContain(TransactionType.BURN);
            // Two FEE_DISTRIBUTION calls (node + AFC)
            expect(types.filter((t) => t === TransactionType.FEE_DISTRIBUTION)).toHaveLength(2);
        });

        it('MINT amount equals transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_A', 'REF_002');

            const mintCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c) => c[0].type === TransactionType.MINT,
            );
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(10_000, 5);
        });

        it('BURN amount equals emissionAmount (full post-TX burn)', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_A', 'REF_003');

            const burnCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c) => c[0].type === TransactionType.BURN,
            );
            expect(parseFloat(burnCall[0].amount)).toBeCloseTo(10_000, 5);
        });

        it('AFC reserve grows after processing a transaction', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_A', 'REF_004');

            const state = service.getAfcReserveState();
            // $10,000 × 0.5% × 25% = 12.50 AFC
            expect(state.totalReserve).toBeCloseTo(12.5, 5);
            // reserveIndex = 1.0 + sqrt(12.5) / 10_000
            const expected = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 8);
        });

        it('reserveIndex is monotonically non-decreasing after multiple TXs', async () => {
            const indices: number[] = [];

            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(1_000, 'ADDR_A', `REF_MONO_${i}`);
                indices.push(service.getCurrentEmissionPrice());
            }

            for (let i = 1; i < indices.length; i++) {
                expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
            }
        });

        it('rolls back all ledger entries on failure', async () => {
            mockLedgerService.recordTransaction
                .mockResolvedValueOnce({ hash: 'MINT_HASH' })   // MINT succeeds
                .mockRejectedValueOnce(new Error('Ledger down')); // FEE_DIST fails

            await expect(
                service.processTransactionEmission(1_000, 'ADDR_A', 'REF_FAIL'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
