import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo = {
    find: jest.fn(),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ── calculate() ───────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('enforces 1:1 emission — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('handles dust amounts without rounding errors', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBe(0.01);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles large amounts correctly', () => {
            const result = service.calculate(1_000_000);
            expect(result.emissionAmount).toBe(1_000_000);
            expect(result.commission).toBeCloseTo(5_000, 8);
            expect(result.nodeShare).toBeCloseTo(3_750, 8);
            expect(result.afcReserveShare).toBeCloseTo(1_250, 8);
        });
    });

    // ── AFC reserve index ─────────────────────────────────────────────────────

    describe('AFC reserve index', () => {
        it('starts at exactly 1.0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
        });

        it('rises monotonically after each emission', async () => {
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_1');
            const after1 = service.getAfcReserveState().reserveIndex;

            mockQueryRunner.manager.find.mockResolvedValue([]);
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_2');
            const after2 = service.getAfcReserveState().reserveIndex;

            expect(after2).toBeGreaterThan(after1);
        });

        it('never decreases (monotonically non-decreasing)', async () => {
            const indices: number[] = [];
            for (let i = 1; i <= 5; i++) {
                mockQueryRunner.manager.find.mockResolvedValue([]);
                await service.processTransactionEmission(1_000, 'ADDR', `REF_${i}`);
                indices.push(service.getAfcReserveState().reserveIndex);
            }

            for (let i = 1; i < indices.length; i++) {
                expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
            }
        });

        it('getCurrentEmissionPrice returns the reserveIndex', async () => {
            const state = service.getAfcReserveState();
            expect(service.getCurrentEmissionPrice()).toBe(state.reserveIndex);
        });

        it('follows sqrt formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            mockQueryRunner.manager.find.mockResolvedValue([]);
            // 10_000 ARO × 0.5% × 25% = 12.5 AFC
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_1');

            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expectedIndex, 10);
        });
    });

    // ── processTransactionEmission() — ledger steps ───────────────────────────

    describe('processTransactionEmission()', () => {
        it('emits four ledger records: MINT, FEE_DISTRIBUTION x2, BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF');
            // 4 recordTransaction calls: MINT, nodeShare FEE_DIST, afcShare FEE_DIST, BURN
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first call is MINT of emissionAmount to recipient', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF');
            const firstCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(firstCall.type).toBe('MINT');
            expect(firstCall.recipient).toBe('RECIPIENT');
            expect(parseFloat(firstCall.amount)).toBeCloseTo(10_000, 5);
        });

        it('last call is BURN of emissionAmount (ARO transient per canonical model)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF');
            const calls = mockLedgerService.recordTransaction.mock.calls;
            const burnCall = calls[calls.length - 1][0];
            expect(burnCall.type).toBe('BURN');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 5);
        });

        it('returns the correct EmissionResult', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 5);
            expect(result.nodeShare).toBeCloseTo(37.5, 5);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 5);
        });

        it('rolls back the transaction on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_FAIL'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    // ── governance — updateCommissionRate() ───────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the rate used by subsequent calculate() calls', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws on rate ≤ 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate ≥ 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
