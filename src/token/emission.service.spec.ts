import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockLedgerService = {
    recordTransaction: jest.fn(),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    describe('calculate()', () => {
        it('emits 1:1 with default 0.5% commission rate', () => {
            const result = service.calculate(10_000);

            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50);        // 10000 × 0.005
            expect(result.nodeShare).toBeCloseTo(37.5);       // 50 × 0.75
            expect(result.afcReserveShare).toBeCloseTo(12.5); // 50 × 0.25
            expect(result.commissionRate).toBe(0.005);
        });

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            const result = service.calculate(7_777.77);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('applies a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
            expect(result.commissionRate).toBe(0.01);
        });

        it('emission always equals transaction amount (1:1 invariant)', () => {
            for (const amount of [1, 100, 999.99, 1_000_000]) {
                expect(service.calculate(amount).emissionAmount).toBe(amount);
            }
        });

        it('throws BadRequestException on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException on negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('handles dust amounts without throwing', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
        });
    });

    describe('getAfcReserveState()', () => {
        it('starts with index 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns a copy — mutations do not affect internal state', () => {
            const state = service.getAfcReserveState();
            (state as any).totalReserve = 99999;
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 initially', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises after addToAfcReserve()', () => {
            service.addToAfcReserve(10_000);
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });
    });

    describe('addToAfcReserve()', () => {
        it('accumulates reserve and raises the index monotonically', () => {
            service.addToAfcReserve(100);
            const idx1 = service.getCurrentEmissionPrice();

            service.addToAfcReserve(100);
            const idx2 = service.getCurrentEmissionPrice();

            expect(idx2).toBeGreaterThan(idx1);
        });

        it('computes index as 1.0 + sqrt(totalReserve) / 10_000', () => {
            service.addToAfcReserve(40_000);
            const expected = 1.0 + Math.sqrt(40_000) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 10);
        });

        it('increments transactionCount', () => {
            service.addToAfcReserve(1);
            service.addToAfcReserve(1);
            expect(service.getAfcReserveState().transactionCount).toBe(2);
        });
    });

    describe('updateCommissionRate()', () => {
        it('updates the commission rate used by calculate()', () => {
            service.updateCommissionRate(0.02);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(20);
        });

        it('throws on rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws on negative rate', () => {
            expect(() => service.updateCommissionRate(-0.1)).toThrow(BadRequestException);
        });
    });

    describe('processTransactionEmission()', () => {
        it('calls ledger in order: MINT → FEE_DISTRIBUTION(node) → FEE_DISTRIBUTION(AFC) → BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');

            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_002');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000);
            expect(mintCall.recipient).toBe('RECIPIENT');
        });

        it('node fee is 75% of commission, AFC fee is 25% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_003');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            const nodeAmount = parseFloat(calls[1][0].amount); // 75%
            const afcAmount  = parseFloat(calls[2][0].amount); // 25%

            expect(nodeAmount).toBeCloseTo(37.5);   // 50 × 0.75
            expect(afcAmount).toBeCloseTo(12.5);    // 50 × 0.25
            expect(nodeAmount + afcAmount).toBeCloseTo(50); // full commission
        });

        it('BURN amount equals the emitted amount (net-zero supply)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_004');

            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000);
        });

        it('commits the transaction on success', async () => {
            await service.processTransactionEmission(500, 'RECIPIENT', 'REF_005');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(500, 'RECIPIENT', 'REF_006'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('updates the AFC reserve index after each emission', async () => {
            const priceBefore = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_007');
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(priceBefore);
        });

        it('throws BadRequestException for zero transaction amount', async () => {
            await expect(
                service.processTransactionEmission(0, 'RECIPIENT', 'REF_008'),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
