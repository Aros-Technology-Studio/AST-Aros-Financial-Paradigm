import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
                { provide: LedgerService, useValue: mockLedgerService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    describe('calculate()', () => {
        it('should apply 1:1 emission for a $10,000 transaction', () => {
            const result = service.calculate(10_000);

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);           // 1:1
            expect(result.commission).toBeCloseTo(50);             // 0.5%
            expect(result.nodeShare).toBeCloseTo(37.5);            // 75%
            expect(result.afcReserveShare).toBeCloseTo(12.5);      // 25%
            expect(result.commissionRate).toBe(0.005);
        });

        it('should respect a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%

            expect(result.emissionAmount).toBe(1_000);
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('should throw on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('should throw on negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('nodeShare + afcReserveShare should equal commission exactly', () => {
            const result = service.calculate(9_999.99);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });
    });

    describe('processTransactionEmission()', () => {
        it('should execute all four ledger steps in canonical order', async () => {
            const calls: string[] = [];
            mockLedgerService.recordTransaction.mockImplementation((tx: any) => {
                calls.push(tx.type);
                return Promise.resolve({ hash: `HASH_${tx.type}` });
            });

            await service.processTransactionEmission(10_000, 'RECIPIENT_001', 'REF_001');

            expect(calls).toEqual([
                TransactionType.MINT,
                TransactionType.FEE_DISTRIBUTION,
                TransactionType.FEE_DISTRIBUTION,
                TransactionType.BURN,
            ]);
        });

        it('should commit the transaction on success', async () => {
            await service.processTransactionEmission(500, 'ADDR_XYZ', 'REF_XYZ');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('should rollback on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('DB down'));

            await expect(
                service.processTransactionEmission(500, 'ADDR_XYZ', 'REF_FAIL'),
            ).rejects.toThrow('DB down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('should return the emission result', async () => {
            const result = await service.processTransactionEmission(10_000, 'REC', 'REF');

            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50);
        });
    });

    describe('AFC reserve and emission price', () => {
        it('reserveIndex should be 1.0 initially', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex should rise after processing a transaction', async () => {
            await service.processTransactionEmission(10_000, 'REC', 'REF_1');
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });

        it('reserveIndex should grow monotonically across multiple transactions', async () => {
            const prices: number[] = [];
            for (let i = 1; i <= 3; i++) {
                await service.processTransactionEmission(10_000, 'REC', `REF_${i}`);
                prices.push(service.getCurrentEmissionPrice());
            }
            expect(prices[1]).toBeGreaterThan(prices[0]);
            expect(prices[2]).toBeGreaterThan(prices[1]);
        });

        it('getAfcReserveState() should return a snapshot, not a live reference', async () => {
            const snap1 = service.getAfcReserveState();
            await service.processTransactionEmission(10_000, 'REC', 'REF_SNAP');
            const snap2 = service.getAfcReserveState();

            expect(snap2.totalReserve).toBeGreaterThan(snap1.totalReserve);
            expect(snap1.totalReserve).toBe(0); // original snapshot unchanged
        });
    });

    describe('updateCommissionRate()', () => {
        it('should accept a valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
        });

        it('should throw on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('should throw on rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('should apply the new rate in subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10); // 1% of 1,000
        });
    });
});
