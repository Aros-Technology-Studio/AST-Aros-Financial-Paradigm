import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

const mockQueryRunner = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(undefined),
    },
};

const mockLedger = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockSupplyRepo = {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue(undefined),
};

describe('EmissionService', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService,                       useValue: mockLedger },
                { provide: DataSource,                          useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockLedger.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ─── calculate() ────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('applies canonical 1:1 emission for $10,000', () => {
            const result = service.calculate(10_000);

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);          // 1:1
            expect(result.commission).toBeCloseTo(50);            // 0.5%
            expect(result.nodeShare).toBeCloseTo(37.5);           // 75% of 50
            expect(result.afcReserveShare).toBeCloseTo(12.5);     // 25% of 50
            expect(result.commissionRate).toBe(0.005);
        });

        it('uses the provided custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%

            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
            expect(result.commissionRate).toBe(0.01);
        });

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            const amounts = [1, 9.99, 100, 1_234.56, 1_000_000];
            for (const amount of amounts) {
                const r = service.calculate(amount);
                expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
            }
        });

        it('emissionAmount always equals transactionAmount (1:1)', () => {
            [0.01, 1, 999, 100_000].forEach(a => {
                expect(service.calculate(a).emissionAmount).toBe(a);
            });
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ─── updateCommissionRate() ──────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the rate and uses it in subsequent calculate() calls', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('rejects negative rate', () => {
            expect(() => service.updateCommissionRate(-0.01)).toThrow(BadRequestException);
        });
    });

    // ─── AFC reserve / price index ───────────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('starts at index 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises monotonically after each emission', async () => {
            const first = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'WALLET_A', 'REF_1');
            const second = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'WALLET_B', 'REF_2');
            const third = service.getCurrentEmissionPrice();

            expect(second).toBeGreaterThan(first);
            expect(third).toBeGreaterThan(second);
        });

        it('index formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // Single $10,000 TX: afcShare = 12.50
            await service.processTransactionEmission(10_000, 'WALLET_A', 'REF_X');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 8);
        });
    });

    // ─── processTransactionEmission() ────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records all four ledger steps: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(500, 'WALLET_A', 'REF_42');

            const calls: any[] = mockLedger.recordTransaction.mock.calls;
            const types = calls.map(([arg]) => arg.type);

            expect(types).toEqual([
                TransactionType.MINT,
                TransactionType.FEE_DISTRIBUTION,
                TransactionType.FEE_DISTRIBUTION,
                TransactionType.BURN,
            ]);
        });

        it('MINT amount equals transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(500, 'WALLET_A', 'REF_43');
            const mintCall = mockLedger.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(500);
        });

        it('BURN amount equals emitted amount (transient tokens destroyed)', async () => {
            await service.processTransactionEmission(500, 'WALLET_A', 'REF_44');
            const calls = mockLedger.recordTransaction.mock.calls;
            const burnCall = calls[calls.length - 1][0];
            expect(burnCall.type).toBe(TransactionType.BURN);
            expect(parseFloat(burnCall.amount)).toBeCloseTo(500);
        });

        it('FEE_DISTRIBUTION node share = 75% of commission', async () => {
            await service.processTransactionEmission(1_000, 'WALLET_A', 'REF_45');
            const nodeCall = mockLedger.recordTransaction.mock.calls[1][0];
            // commission = 1000 × 0.005 = 5; nodeShare = 5 × 0.75 = 3.75
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(3.75);
        });

        it('FEE_DISTRIBUTION AFC share = 25% of commission', async () => {
            await service.processTransactionEmission(1_000, 'WALLET_A', 'REF_46');
            const afcCall = mockLedger.recordTransaction.mock.calls[2][0];
            // commission = 5; afcShare = 5 × 0.25 = 1.25
            expect(parseFloat(afcCall.amount)).toBeCloseTo(1.25);
        });

        it('rolls back all ledger steps on failure', async () => {
            mockLedger.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(500, 'WALLET_A', 'REF_ERR'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('returns EmissionResult with correct shape', async () => {
            const result = await service.processTransactionEmission(200, 'WALLET_B', 'REF_47');
            expect(result).toMatchObject({
                transactionAmount: 200,
                emissionAmount:    200,
                commission:        expect.any(Number),
                nodeShare:         expect.any(Number),
                afcReserveShare:   expect.any(Number),
                commissionRate:    0.005,
            });
        });
    });
});
