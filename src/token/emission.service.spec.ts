import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };

const mockLedgerService = { recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX' }) };

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
    });

    describe('calculate() — canonical 1:1 model', () => {
        it('emissionAmount equals transactionAmount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('commission = amount × default rate (0.5%)', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('nodeShare = commission × 0.75 (75%)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare = commission × 0.25 (25%)', () => {
            const result = service.calculate(10_000);
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

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-1)).toThrow(BadRequestException);
        });
    });

    describe('updateAfcReserve() — price index rises monotonically', () => {
        it('initial reserveIndex is 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after adding AFC amount', () => {
            service.updateAfcReserve(12.5);
            const idx = service.getCurrentEmissionPrice();
            expect(idx).toBeGreaterThan(1.0);
        });

        it('reserveIndex follows sqrt formula: 1.0 + sqrt(total) / 10_000', () => {
            service.updateAfcReserve(10_000);
            const expected = 1.0 + Math.sqrt(10_000) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 8);
        });

        it('reserveIndex is monotonically non-decreasing', () => {
            const values: number[] = [];
            for (const chunk of [100, 200, 50, 1000]) {
                service.updateAfcReserve(chunk);
                values.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < values.length; i++) {
                expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
            }
        });

        it('ignores zero or negative amounts', () => {
            const before = service.getCurrentEmissionPrice();
            service.updateAfcReserve(0);
            expect(service.getCurrentEmissionPrice()).toBe(before);
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

        it('rejects rate of 1 or above', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });
});
