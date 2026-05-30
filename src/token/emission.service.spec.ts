import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_MOCK' }),
};

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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_MOCK' });
    });

    describe('calculate() — pure 1:1 emission formula', () => {
        it('returns emission equal to transaction amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
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

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('handles dust amounts', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeCloseTo(0.00000001 * 0.005, 15);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    describe('processTransactionEmission() — full lifecycle', () => {
        it('records 4 ledger operations in canonical order', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_01', 'REF_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);

            // 1. MINT
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(parseFloat(calls[0][0].amount)).toBeCloseTo(10_000, 6);

            // 2. Node fee distribution
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[1][0].recipient).toBe('SYSTEM_NODE_POOL_00000000000000000000');
            expect(parseFloat(calls[1][0].amount)).toBeCloseTo(37.5, 6);

            // 3. AFC reserve distribution
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].recipient).toBe('SYSTEM_AFC_RESERVE_000000000000000000');
            expect(parseFloat(calls[2][0].amount)).toBeCloseTo(12.5, 6);

            // 4. BURN
            expect(calls[3][0].type).toBe(TransactionType.BURN);
            expect(parseFloat(calls[3][0].amount)).toBeCloseTo(10_000, 6);
        });

        it('returns EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(5_000, 'ADDR_X', 'REF_002');
            expect(result.emissionAmount).toBe(5_000);
            expect(result.commission).toBeCloseTo(25, 8);
            expect(result.nodeShare).toBeCloseTo(18.75, 8);
            expect(result.afcReserveShare).toBeCloseTo(6.25, 8);
        });

        it('rolls back all 4 operations on ledger error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(100, 'ADDR_Y', 'REF_ERR'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });
    });

    describe('AFC reserve price index', () => {
        it('starts at reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('grows after each emission (monotonically non-decreasing)', async () => {
            const p0 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'A', 'TX1');
            const p1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'A', 'TX2');
            const p2 = service.getCurrentEmissionPrice();

            expect(p1).toBeGreaterThan(p0);
            expect(p2).toBeGreaterThan(p1);
        });

        it('follows reserveIndex = 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // One TX: afcShare = 10_000 * 0.005 * 0.25 = 12.5
            await service.processTransactionEmission(10_000, 'A', 'IDX_TX1');
            const expected = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 8);
        });
    });

    describe('updateCommissionRate()', () => {
        it('accepts valid rate and uses it in next calculation', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws on rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
