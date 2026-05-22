import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };

const mockLedgerService = { recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }) };

const mockQueryRunner = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('returns 1:1 emission for default 0.5% rate', () => {
            const result = service.calculate(10_000);

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);           // 1:1
            expect(result.commission).toBeCloseTo(50);             // 0.5%
            expect(result.nodeShare).toBeCloseTo(37.5);            // 75%
            expect(result.afcReserveShare).toBeCloseTo(12.5);      // 25%
            expect(result.commissionRate).toBe(0.005);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(99_999.99);
            const reconstructed = result.nodeShare + result.afcReserveShare;
            expect(reconstructed).toBeCloseTo(result.commission, 8);
        });

        it('respects a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-1)).toThrow(BadRequestException);
        });

        it('emission always equals transactionAmount regardless of rate', () => {
            [0.001, 0.005, 0.02, 0.1].forEach(rate => {
                const result = service.calculate(500, rate);
                expect(result.emissionAmount).toBe(result.transactionAmount);
            });
        });
    });

    // ── AFC reserve ──────────────────────────────────────────────────────────

    describe('AFC reserve and price index', () => {
        it('starts with reserveIndex of 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
        });

        it('getCurrentEmissionPrice() returns reserveIndex', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ── governance ───────────────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and subsequent calculate() uses it', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1 (100%)', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('rejects rate > 1', () => {
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('calls ledger 4 times (MINT, 2×FEE_DISTRIBUTION, BURN)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_001');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('commits the QueryRunner transaction on success', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_002');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('DB Error'));
            await expect(
                service.processTransactionEmission(500, 'RECIPIENT', 'REF_003'),
            ).rejects.toThrow('DB Error');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('returns EmissionResult with correct 1:1 amounts', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_004');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50);
        });

        it('AFC reserve grows after each emission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_010');
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBeGreaterThan(0);
            expect(state.reserveIndex).toBeGreaterThan(1.0);
            expect(state.transactionCount).toBe(1);
        });

        it('AFC reserveIndex is monotonically non-decreasing across emissions', async () => {
            let prevIndex = service.getCurrentEmissionPrice();
            for (let i = 1; i <= 5; i++) {
                await service.processTransactionEmission(1_000, 'RECIPIENT', `REF_MONO_${i}`);
                const currentIndex = service.getCurrentEmissionPrice();
                expect(currentIndex).toBeGreaterThanOrEqual(prevIndex);
                prevIndex = currentIndex;
            }
        });
    });
});
