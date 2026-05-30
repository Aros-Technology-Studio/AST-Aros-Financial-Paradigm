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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue({});
    });

    // ─── calculate() — pure function, no side effects ───────────────────────

    describe('calculate()', () => {
        it('returns 1:1 emission equal to transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('computes commission at default 0.5% rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 6);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% to nodes and 25% to AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 6);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 6);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('respects a custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100, 6);
            expect(result.nodeShare).toBeCloseTo(75, 6);
            expect(result.afcReserveShare).toBeCloseTo(25, 6);
        });

        it('handles small (dust) amounts without zero-division', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeCloseTo(0.00000001 * 0.005, 15);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('invariant: emissionAmount === transactionAmount for any positive input', () => {
            for (const amount of [1, 100, 9999.99, 1_000_000]) {
                const r = service.calculate(amount);
                expect(r.emissionAmount).toBe(r.transactionAmount);
            }
        });
    });

    // ─── AFC reserve ─────────────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts with reserveIndex = 1.0 and totalReserve = 0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 before any emissions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    describe('updateCommissionRate()', () => {
        it('accepts valid rate in (0, 1)', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
            expect(service.calculate(1000).commissionRate).toBe(0.01);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1 (100%)', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() ────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records four ledger entries per canonical cycle (MINT, FEE×2, BURN)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_1');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            const types = calls.map((c: any[]) => c[0].type);
            expect(types[0]).toBe(TransactionType.MINT);
            expect(types[1]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[2]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[3]).toBe(TransactionType.BURN);
        });

        it('mints exactly the transaction amount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_2');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('burns exactly the emission amount (= transaction amount)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_3');

            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('uses distinct nonce values for all four ledger entries', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT_2', 'REF_4');

            const nonces = mockLedgerService.recordTransaction.mock.calls.map(
                (c: any[]) => c[0].nonce,
            );
            const uniqueNonces = new Set(nonces);
            expect(uniqueNonces.size).toBe(4);
        });

        it('commits the queryRunner on success', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT_3', 'REF_5');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows if a ledger write fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT_4', 'REF_6'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('updates AFC reserve after successful emission', async () => {
            const before = service.getAfcReserveState().totalReserve;
            await service.processTransactionEmission(10_000, 'RECIPIENT_5', 'REF_7');
            const after = service.getAfcReserveState().totalReserve;

            // afcShare = 10_000 * 0.005 * 0.25 = 12.5
            expect(after - before).toBeCloseTo(12.5, 4);
        });

        it('reserveIndex rises monotonically after each emission', async () => {
            const idx0 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'R', 'REF_8');
            const idx1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'R', 'REF_9');
            const idx2 = service.getCurrentEmissionPrice();

            expect(idx1).toBeGreaterThan(idx0);
            expect(idx2).toBeGreaterThan(idx1);
        });

        it('returns the correct EmissionResult', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_6', 'REF_10');

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 4);
            expect(result.nodeShare).toBeCloseTo(37.5, 4);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 4);
        });
    });
});
