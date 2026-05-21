import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
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

    // ─── calculate() — pure canonical formula ───────────────────────────────

    describe('calculate()', () => {
        it('enforces 1:1 emission: emissionAmount == transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
        });

        it('computes commission at default 0.5% rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws on non-positive transaction amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
            expect(() => service.calculate(-1)).toThrow(BadRequestException);
        });

        it('handles dust amounts without precision error', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01, 8);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });
    });

    // ─── processTransactionEmission() — full lifecycle ───────────────────────

    describe('processTransactionEmission()', () => {
        it('records 4 ledger operations: MINT, FEE_DISTRIBUTION×2, BURN', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');

            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('mints and burns the same emissionAmount (net-zero supply)', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF_002');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            const mintAmount = parseFloat(calls[0][0].amount);
            const burnAmount = parseFloat(calls[3][0].amount);
            expect(mintAmount).toBe(burnAmount);
        });

        it('rollbacks all ledger steps if any step throws', async () => {
            mockLedgerService.recordTransaction.mockRejectedValue(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_003'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('returns EmissionResult with correct canonical values', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            const result = await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_004');

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });
    });

    // ─── AFC reserve index ────────────────────────────────────────────────────

    describe('AFC reserve & emission price', () => {
        it('initial emission price is 1.0 (zero reserve)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('emission price rises monotonically after each transaction', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            const price0 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_005');
            const price1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_006');
            const price2 = service.getCurrentEmissionPrice();

            expect(price1).toBeGreaterThan(price0);
            expect(price2).toBeGreaterThan(price1);
        });

        it('price index = 1.0 + sqrt(totalReserve) / 10000', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            // tx=10000, commission=50, afcShare=12.5
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_007');

            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expectedIndex, 10);
        });
    });

    // ─── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
        });

        it('rejects rate === 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate === 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('new rate is applied in subsequent calculations', async () => {
            service.updateCommissionRate(0.01); // 1%
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });
    });
});
