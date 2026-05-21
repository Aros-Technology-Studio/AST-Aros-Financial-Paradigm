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
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    describe('calculate() — pure canonical formula', () => {
        it('emits 1:1 for a standard transaction', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('computes 0.5% commission by default', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare == commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('handles dust amounts (0.01 ARO)', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01, 8);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });

        it('handles large amounts (1,000,000 ARO)', () => {
            const result = service.calculate(1_000_000);
            expect(result.emissionAmount).toBe(1_000_000);
            expect(result.commission).toBeCloseTo(5_000, 6);
            expect(result.nodeShare).toBeCloseTo(3_750, 6);
            expect(result.afcReserveShare).toBeCloseTo(1_250, 6);
        });
    });

    describe('processTransactionEmission() — canonical lifecycle', () => {
        it('records MINT, two FEE_DISTRIBUTION, and BURN in order', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT_1', 'REF_1');

            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[1][0].metadata.operation).toBe('NODE_FEE_75PCT');
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].metadata.operation).toBe('AFC_RESERVE_25PCT');
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('mints the correct 1:1 amount', async () => {
            await service.processTransactionEmission(500, 'RECIPIENT_2', 'REF_2');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(500, 8);
            expect(mintCall.recipient).toBe('RECIPIENT_2');
        });

        it('burns exactly the emitted amount', async () => {
            await service.processTransactionEmission(500, 'RECIPIENT_3', 'REF_3');

            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(500, 8);
            expect(burnCall.type).toBe(TransactionType.BURN);
        });

        it('commits the transaction on success', async () => {
            await service.processTransactionEmission(100, 'RECIPIENT_4', 'REF_4');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(100, 'RECIPIENT_5', 'REF_5'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('returns EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(2_000, 'RECIPIENT_6', 'REF_6');

            expect(result.emissionAmount).toBe(2_000);
            expect(result.transactionAmount).toBe(2_000);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });
    });

    describe('AFC reserve and price index', () => {
        it('starts with reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after a transaction', async () => {
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_IDX_1');
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });

        it('reserveIndex is monotonically non-decreasing across multiple transactions', async () => {
            let prev = service.getCurrentEmissionPrice();
            for (let i = 1; i <= 5; i++) {
                await service.processTransactionEmission(1_000, 'ADDR', `REF_MONO_${i}`);
                const current = service.getCurrentEmissionPrice();
                expect(current).toBeGreaterThanOrEqual(prev);
                prev = current;
            }
        });

        it('reserveIndex formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // After one TX of 10,000 ARO:
            //   afcShare = 10,000 × 0.005 × 0.25 = 12.5
            //   reserveIndex = 1.0 + sqrt(12.5) / 10_000 ≈ 1.00003535
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_FORMULA');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 8);
        });

        it('getAfcReserveState() increments transactionCount', async () => {
            await service.processTransactionEmission(1_000, 'ADDR', 'REF_CNT_1');
            await service.processTransactionEmission(1_000, 'ADDR', 'REF_CNT_2');
            const state = service.getAfcReserveState();
            expect(state.transactionCount).toBe(2);
        });

        it('getAfcReserveState() returns a copy (immutable snapshot)', async () => {
            const state = service.getAfcReserveState();
            (state as any).reserveIndex = 999;
            expect(service.getCurrentEmissionPrice()).toBe(1.0); // unchanged
        });
    });

    describe('updateCommissionRate()', () => {
        it('updates the commission rate used in subsequent calculations', async () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws on rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });

        it('throws on negative rate', () => {
            expect(() => service.updateCommissionRate(-0.01)).toThrow(BadRequestException);
        });
    });
});
