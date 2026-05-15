import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
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
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(undefined),
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
                { provide: 'DataSource', useValue: mockDataSource },
            ],
        })
            .overrideProvider('DataSource')
            .useValue(mockDataSource)
            .compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ────────────────────────────────────────────────────────────────────────
    // calculate() — pure function, canonical 1:1 model
    // ────────────────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 — emission equals transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies 0.5% default commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBeCloseTo(0.005);
            expect(result.commission).toBeCloseTo(50);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('handles small (dust) amounts', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeCloseTo(0.00000001 * 0.005);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // AFC reserve price index
    // ────────────────────────────────────────────────────────────────────────

    describe('AFC reserve index', () => {
        it('starts at 1.0 (no reserve accumulated)', () => {
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(1.0);
        });

        it('rises monotonically as AFC reserve accumulates', () => {
            const before = service.getCurrentEmissionPrice();
            // Trigger reserve growth directly via calculate + getAfcReserveState
            const result = service.calculate(100_000);
            // Simulate reserve update
            (service as any).updateAfcReserve(result.afcReserveShare);
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('reserveIndex = 1.0 + sqrt(totalReserve) / 10_000', () => {
            const testAmount = 10_000; // 25 AFC units at 0.5% rate, 25% split = 12.5
            const afcAmount = testAmount * 0.005 * 0.25; // 12.5
            (service as any).updateAfcReserve(afcAmount);
            const expectedIndex = 1.0 + Math.sqrt(afcAmount) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expectedIndex, 6);
        });

        it('getAfcReserveState returns a read-only snapshot', () => {
            const state = service.getAfcReserveState();
            expect(state).toHaveProperty('totalReserve');
            expect(state).toHaveProperty('reserveIndex');
            expect(state).toHaveProperty('transactionCount');
            expect(state).toHaveProperty('lastUpdated');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // updateCommissionRate()
    // ────────────────────────────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates rate and is reflected in calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10);
        });

        it('rejects rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Canonical example: $10,000 transaction
    // ────────────────────────────────────────────────────────────────────────

    describe('canonical $10,000 example', () => {
        it('matches specification exactly', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
        });
    });
});
