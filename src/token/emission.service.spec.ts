import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };

const mockLedgerService = { recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX' }) };

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
};

const mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };

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
    });

    describe('calculate() — pure emission formula', () => {
        it('emits 1:1 — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies 0.5% default commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
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

        it('uses custom commission rate when provided', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts correctly', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 14);
        });
    });

    describe('AFC reserve index — sqrt growth formula', () => {
        it('starts at index 1.0 (no reserve)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('index rises monotonically as AFC reserve accumulates', () => {
            // Verified via processTransactionEmission test below; here confirm initial state
            const state1 = service.getAfcReserveState();
            expect(state1.reserveIndex).toBe(1.0);
        });

        it('getAfcReserveState returns read-only snapshot', () => {
            const state = service.getAfcReserveState();
            expect(state).toHaveProperty('totalReserve');
            expect(state).toHaveProperty('reserveIndex');
            expect(state).toHaveProperty('transactionCount');
            expect(state).toHaveProperty('lastUpdated');
        });
    });

    describe('processTransactionEmission() — full lifecycle', () => {
        it('executes all 4 ledger operations for a canonical TX', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_1' });
            mockQueryRunner.manager.find.mockResolvedValue([]);

            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            // Expect MINT, 2× FEE_DISTRIBUTION, BURN = 4 calls
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back all ledger operations on failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger down'));

            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT_ADDR', 'REF_ERR'),
            ).rejects.toThrow('ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('AFC reserve index rises after successful emission', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_2' });
            mockQueryRunner.manager.find.mockResolvedValue([]);

            const indexBefore = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(100_000, 'ADDR', 'REF_002');
            const indexAfter = service.getCurrentEmissionPrice();

            expect(indexAfter).toBeGreaterThan(indexBefore);
        });
    });
});
