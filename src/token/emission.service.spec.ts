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
        save: jest.fn().mockResolvedValue({}),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue({}),
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
        mockQueryRunner.manager.save.mockResolvedValue({});
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_TX_HASH' });
    });

    // -------------------------------------------------------------------------
    // calculate() — pure function
    // -------------------------------------------------------------------------

    describe('calculate()', () => {
        it('emissionAmount equals transactionAmount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('default commission rate is 0.5%', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('nodeShare is 75% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare is 25% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare equals commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.nodeShare).toBeCloseTo(75, 8);
            expect(result.afcReserveShare).toBeCloseTo(25, 8);
        });

        it('rejects zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('rejects negative amount', () => {
            expect(() => service.calculate(-1)).toThrow(BadRequestException);
        });

        it('handles dust amounts without error', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeCloseTo(0.00000001 * 0.005, 14);
        });
    });

    // -------------------------------------------------------------------------
    // AFC reserve — price index grows monotonically
    // -------------------------------------------------------------------------

    describe('AFC reserve index', () => {
        it('starts at 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises after processTransactionEmission()', async () => {
            const priceBefore = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'ADDR_TEST', 'REF_1');
            const priceAfter = service.getCurrentEmissionPrice();
            expect(priceAfter).toBeGreaterThan(priceBefore);
        });

        it('is monotonically non-decreasing over multiple transactions', async () => {
            const prices: number[] = [service.getCurrentEmissionPrice()];
            for (let i = 1; i <= 3; i++) {
                await service.processTransactionEmission(1_000, `ADDR_${i}`, `REF_${i}`);
                prices.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });

        it('uses sqrt formula: reserveIndex = 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // First TX: afcShare = 10_000 * 0.005 * 0.25 = 12.5
            await service.processTransactionEmission(10_000, 'ADDR_A', 'REF_A');
            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expectedIndex, 10);
        });
    });

    // -------------------------------------------------------------------------
    // processTransactionEmission() — full lifecycle
    // -------------------------------------------------------------------------

    describe('processTransactionEmission()', () => {
        it('calls ledger MINT → FEE_DISTRIBUTION x2 → BURN in order', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_LIFECYCLE');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('MINT amount equals transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_MINT');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('BURN amount equals emissionAmount (transient tokens)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_BURN');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('75% fee goes to NODE_POOL, 25% to AFC_RESERVE', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_SPLIT');
            const calls = mockLedgerService.recordTransaction.mock.calls;
            const nodeCall = calls[1][0];
            const afcCall  = calls[2][0];

            expect(nodeCall.recipient).toContain('NODE_POOL');
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 6);

            expect(afcCall.recipient).toContain('AFC_RESERVE');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 6);
        });

        it('commits QueryRunner on success', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF_COMMIT');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_FAIL'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('rejects zero amount', async () => {
            await expect(
                service.processTransactionEmission(0, 'RECIPIENT', 'REF_ZERO'),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
