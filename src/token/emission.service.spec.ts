import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

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

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
};

describe('EmissionService — canonical 1:1 model', () => {
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    describe('calculate() — pure function', () => {
        it('emits exactly 1:1 with transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('accepts custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100);
            expect(result.nodeShare).toBeCloseTo(75);
            expect(result.afcReserveShare).toBeCloseTo(25);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('emission equals transaction amount exactly (invariant)', () => {
            for (const amount of [1, 100, 999.99, 1_000_000]) {
                const result = service.calculate(amount);
                expect(result.emissionAmount).toBe(amount);
            }
        });
    });

    describe('processTransactionEmission() — lifecycle', () => {
        it('records 4 ledger entries: MINT, 2×FEE_DISTRIBUTION, BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_001', 'REF_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            const types = calls.map((c: any[]) => c[0].type);
            expect(types[0]).toBe(TransactionType.MINT);
            expect(types[1]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[2]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[3]).toBe(TransactionType.BURN);
        });

        it('mints exactly transactionAmount (1:1 invariant)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_001', 'REF_002');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000);
        });

        it('burns exactly emissionAmount (net-zero supply invariant)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_001', 'REF_003');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000);
        });

        it('grows AFC reserve index after each transaction', async () => {
            const priceBefore = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_001', 'REF_004');
            const priceAfter = service.getCurrentEmissionPrice();
            expect(priceAfter).toBeGreaterThan(priceBefore);
        });

        it('rolls back all ledger entries if an error occurs', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));
            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_001', 'REF_FAIL'),
            ).rejects.toThrow('Ledger failure');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('AFC reserve index (price model)', () => {
        it('starts at 1.0 with empty reserve', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex = 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // After one TX of 10,000 at 0.5% → AFC share = 12.5
            await service.processTransactionEmission(10_000, 'RECIPIENT_001', 'REF_IDX');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected);
        });

        it('reserveIndex is monotonically non-decreasing', async () => {
            const prices: number[] = [];
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(1_000, `ADDR_${i}`, `REF_MONO_${i}`);
                prices.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });
    });

    describe('updateCommissionRate()', () => {
        it('updates rate and affects subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(100);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
