import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
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
    });

    describe('calculate() — canonical 1:1 model', () => {
        it('emission equals transaction amount (1:1)', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
        });

        it('commission = txAmount × default rate 0.5%', () => {
            const r = service.calculate(10_000);
            expect(r.commission).toBeCloseTo(50, 8);
        });

        it('node share = 75% of commission', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('AFC reserve share = 25% of commission', () => {
            const r = service.calculate(10_000);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcShare = commission (no rounding loss)', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 8);
        });

        it('supports custom commission rate', () => {
            const r = service.calculate(10_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(100, 8);
            expect(r.nodeShare).toBeCloseTo(75, 8);
            expect(r.afcReserveShare).toBeCloseTo(25, 8);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-1)).toThrow(BadRequestException);
        });

        it('handles dust amounts without throwing', () => {
            const r = service.calculate(0.00000001);
            expect(r.emissionAmount).toBe(0.00000001);
        });
    });

    describe('AFC reserve price index', () => {
        it('starts at 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises after processTransactionEmission', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H' });
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_1');
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });

        it('is monotonically non-decreasing across multiple transactions', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H' });

            let prev = service.getCurrentEmissionPrice();
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(1_000, 'RECIPIENT', `REF_${i}`);
                const current = service.getCurrentEmissionPrice();
                expect(current).toBeGreaterThanOrEqual(prev);
                prev = current;
            }
        });

        it('index formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H' });
            // $10,000 tx → afcShare = 12.50
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_1');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 10);
        });
    });

    describe('processTransactionEmission() — full canonical lifecycle', () => {
        beforeEach(() => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_TX' });
        });

        it('records 4 ledger operations per transaction', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF_A');
            // MINT + FEE_DISTRIBUTION(nodes) + FEE_DISTRIBUTION(AFC) + BURN = 4
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('returns emission result with correct amounts', async () => {
            const result = await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF_B');
            expect(result.emissionAmount).toBe(5_000);
            expect(result.commission).toBeCloseTo(25, 8);
            expect(result.nodeShare).toBeCloseTo(18.75, 8);
            expect(result.afcReserveShare).toBeCloseTo(6.25, 8);
        });

        it('rolls back if a ledger call fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger down'));
            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_FAIL'),
            ).rejects.toThrow('ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('updateCommissionRate()', () => {
        it('accepts valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1 or above', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });
});
