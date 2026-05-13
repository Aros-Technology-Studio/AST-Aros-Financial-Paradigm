import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

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
        find: jest.fn(),
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
    });

    describe('calculate() — pure canonical formula', () => {
        it('emits 1:1 — emission equals transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('nodeShare + afcShare == commission (no rounding loss) for various amounts', () => {
            for (const amount of [1, 0.01, 999.99, 1_000_000]) {
                const r = service.calculate(amount);
                expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
            }
        });
    });

    describe('getCurrentEmissionPrice() — AFC reserve index', () => {
        it('starts at 1.0 (zero reserve)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('getAfcReserveState() starts with totalReserve = 0 and reserveIndex = 1.0', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.reserveIndex).toBe(1.0);
            expect(state.transactionCount).toBe(0);
        });
    });

    describe('updateCommissionRate()', () => {
        it('updates rate within valid range', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws if rate is 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws if rate is >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });

    describe('processTransactionEmission() — canonical lifecycle', () => {
        beforeEach(() => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
            mockQueryRunner.manager.find.mockResolvedValue([]);
        });

        it('records 4 ledger entries: MINT, FEE_DISTRIBUTION×2, BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('MINT record has emissionAmount = transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(mintCall.type).toBe('MINT');
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('BURN record has emissionAmount = transactionAmount (net-zero supply)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(burnCall.type).toBe('BURN');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('node FEE_DISTRIBUTION is 75% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 6);
        });

        it('AFC FEE_DISTRIBUTION is 25% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 6);
        });

        it('AFC reserve index rises after emission', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('AFC reserveIndex follows sqrt formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expectedIndex, 10);
        });

        it('returns EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('rolls back on ledger error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_002'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
