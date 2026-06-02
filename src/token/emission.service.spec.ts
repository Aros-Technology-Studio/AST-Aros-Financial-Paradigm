import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockLedgerService = { recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_HASH' }) };
const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };
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
    });

    describe('calculate() — canonical 1:1 formula', () => {
        it('emits exactly 1:1 the transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBeCloseTo(0.005);
            expect(result.commission).toBeCloseTo(50);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);          // 75%
            expect(result.afcReserveShare).toBeCloseTo(12.5);    // 25%
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01);        // 1%
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts (0.01) without loss of split invariant', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });
    });

    describe('processTransactionEmission() — lifecycle', () => {
        it('records MINT, two FEE_DISTRIBUTION, and BURN ledger entries', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            await service.processTransactionEmission(100, 'ADDR_1', 'REF_1');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            const types = calls.map((c: any[]) => c[0].type);
            expect(types[0]).toBe(TransactionType.MINT);
            expect(types[1]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[2]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(types[3]).toBe(TransactionType.BURN);
        });

        it('burns exactly the emitted amount (1:1)', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            await service.processTransactionEmission(500, 'ADDR_1', 'REF_2');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            const mintAmount = parseFloat(calls[0][0].amount);
            const burnAmount = parseFloat(calls[3][0].amount);
            expect(mintAmount).toBe(burnAmount);
            expect(mintAmount).toBeCloseTo(500);
        });

        it('rolls back if ledger throws', async () => {
            mockLedgerService.recordTransaction.mockRejectedValue(new Error('ledger down'));

            await expect(
                service.processTransactionEmission(100, 'ADDR_1', 'REF_3'),
            ).rejects.toThrow('ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });
    });

    describe('AFC reserve state', () => {
        it('starts with reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after each emission (monotonic)', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });

            await service.processTransactionEmission(10_000, 'ADDR_1', 'REF_A');
            const idx1 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(10_000, 'ADDR_1', 'REF_B');
            const idx2 = service.getCurrentEmissionPrice();

            expect(idx1).toBeGreaterThan(1.0);
            expect(idx2).toBeGreaterThan(idx1);
        });

        it('getAfcReserveState() returns a snapshot (not a live reference)', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });
            const snapshot = service.getAfcReserveState();
            await service.processTransactionEmission(1_000, 'ADDR_1', 'REF_C');
            expect(snapshot.totalReserve).toBe(0); // snapshot is frozen
        });
    });

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
        });

        it('throws for rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
