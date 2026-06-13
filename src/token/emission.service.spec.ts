import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };
const mockLedgerService = { recordTransaction: jest.fn() };
const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
};
const mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };

describe('EmissionService.calculate()', () => {
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

    it('should emit 1:1 with default 0.5% commission', () => {
        const result = service.calculate(10_000);

        expect(result.transactionAmount).toBe(10_000);
        expect(result.emissionAmount).toBe(10_000);         // 1:1
        expect(result.commission).toBeCloseTo(50);          // 0.5%
        expect(result.nodeShare).toBeCloseTo(37.5);         // 75%
        expect(result.afcReserveShare).toBeCloseTo(12.5);   // 25%
        expect(result.commissionRate).toBe(0.005);
    });

    it('nodeShare + afcReserveShare should equal commission exactly', () => {
        const result = service.calculate(7_777.77);
        expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
    });

    it('should accept a custom commission rate', () => {
        const result = service.calculate(1_000, 0.01); // 1%
        expect(result.commission).toBeCloseTo(10);
        expect(result.nodeShare).toBeCloseTo(7.5);
        expect(result.afcReserveShare).toBeCloseTo(2.5);
        expect(result.commissionRate).toBe(0.01);
    });

    it('should throw for zero amount', () => {
        expect(() => service.calculate(0)).toThrow(BadRequestException);
    });

    it('should throw for negative amount', () => {
        expect(() => service.calculate(-100)).toThrow(BadRequestException);
    });

    it('should handle dust amounts without throwing', () => {
        const result = service.calculate(0.00000001);
        expect(result.emissionAmount).toBe(0.00000001);
        expect(result.commission).toBeGreaterThanOrEqual(0);
    });
});

describe('EmissionService.updateAfcReserve & getCurrentEmissionPrice()', () => {
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

    it('should start at reserveIndex = 1.0', () => {
        expect(service.getCurrentEmissionPrice()).toBe(1.0);
    });

    it('AFC reserve accumulation should raise the emission price index monotonically', async () => {
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX1' });

        const before = service.getCurrentEmissionPrice();

        await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');

        const after = service.getCurrentEmissionPrice();
        expect(after).toBeGreaterThan(before);
    });
});
