import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
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
        it('applies 1:1 emission: emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('calculates 0.5% default commission', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('respects custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('works correctly for dust amounts', () => {
            const result = service.calculate(0.000001);
            expect(result.emissionAmount).toBe(0.000001);
            expect(result.commission).toBeCloseTo(0.000001 * 0.005, 15);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    describe('getAfcReserveState() and getCurrentEmissionPrice()', () => {
        it('initialises with index 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.reserveIndex).toBe(1.0);
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    describe('recordEpochAfcContribution()', () => {
        it('increments the AFC reserve and raises the price index', () => {
            service.recordEpochAfcContribution(10_000);
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(10_000);
            // reserveIndex = 1 + sqrt(10000) / 10000 = 1 + 100/10000 = 1.01
            expect(state.reserveIndex).toBeCloseTo(1.01, 8);
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(1.01, 8);
        });

        it('ignores zero and negative contributions', () => {
            service.recordEpochAfcContribution(0);
            service.recordEpochAfcContribution(-5);
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });

        it('is monotonically non-decreasing after multiple contributions', () => {
            service.recordEpochAfcContribution(100);
            const index1 = service.getCurrentEmissionPrice();
            service.recordEpochAfcContribution(100);
            const index2 = service.getCurrentEmissionPrice();
            expect(index2).toBeGreaterThanOrEqual(index1);
        });
    });

    describe('processTransactionEmission()', () => {
        it('returns canonical emission result for $10,000 TX', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_1');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('records 4 ledger operations: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(1_000, 'ADDR_X', 'REF_2');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('updates AFC reserve state after emission', async () => {
            await service.processTransactionEmission(1_000, 'ADDR_X', 'REF_3');
            // afcShare = 1000 * 0.005 * 0.25 = 1.25
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBeCloseTo(1.25, 8);
        });

        it('rolls back all ledger ops if one fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));
            await expect(
                service.processTransactionEmission(500, 'ADDR_Y', 'REF_FAIL'),
            ).rejects.toThrow('Ledger failure');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });

    describe('updateCommissionRate()', () => {
        it('updates the default rate used in calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1 (100%)', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
