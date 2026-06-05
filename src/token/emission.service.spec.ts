import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo  = { find: jest.fn(), save: jest.fn() };
const mockLedgerSvc   = { recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX' }) };
const mockQueryRunner = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
    manager: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
};
const mockDataSource  = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };

describe('EmissionService', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService,                      useValue: mockLedgerSvc  },
                { provide: DataSource,                         useValue: mockDataSource  },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
    });

    describe('calculate()', () => {
        it('emits 1:1 — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5,  8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5,  8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts without rounding errors', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01, 10);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });
    });

    describe('getAfcReserveState()', () => {
        it('starts with reserveIndex = 1.0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });
    });

    describe('updateAfcReserve()', () => {
        it('increases totalReserve monotonically', () => {
            service.updateAfcReserve(12.5);
            expect(service.getAfcReserveState().totalReserve).toBeCloseTo(12.5, 8);
        });

        it('raises reserveIndex above 1.0 after accumulation', () => {
            service.updateAfcReserve(12.5);
            const index = service.getAfcReserveState().reserveIndex;
            expect(index).toBeGreaterThan(1.0);
        });

        it('follows sqrt formula: 1.0 + sqrt(reserve) / 10_000', () => {
            service.updateAfcReserve(10_000);
            const expected = 1.0 + Math.sqrt(10_000) / 10_000; // 1.01
            expect(service.getAfcReserveState().reserveIndex).toBeCloseTo(expected, 8);
        });

        it('is monotonically non-decreasing across multiple calls', () => {
            const indices: number[] = [];
            for (let i = 0; i < 5; i++) {
                service.updateAfcReserve(100);
                indices.push(service.getAfcReserveState().reserveIndex);
            }
            for (let i = 1; i < indices.length; i++) {
                expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
            }
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 initially', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises after AFC reserve grows', () => {
            service.updateAfcReserve(10_000);
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });
    });

    describe('processTransactionEmission()', () => {
        it('executes all four ledger steps and returns emission result', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');

            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);

            // MINT + 2× FEE_DISTRIBUTION + BURN = 4 ledger calls
            expect(mockLedgerSvc.recordTransaction).toHaveBeenCalledTimes(4);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
        });

        it('rolls back on ledger failure', async () => {
            mockLedgerSvc.recordTransaction.mockRejectedValueOnce(new Error('ledger down'));

            await expect(
                service.processTransactionEmission(100, 'RECIPIENT', 'REF_FAIL'),
            ).rejects.toThrow('ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });
});
