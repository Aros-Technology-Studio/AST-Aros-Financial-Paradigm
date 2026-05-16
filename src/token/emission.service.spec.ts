import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockLedger = { recordTransaction: jest.fn().mockResolvedValue({}) };

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

describe('EmissionService — canonical 1:1 model', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: {} },
                { provide: LedgerService,  useValue: mockLedger },
                { provide: DataSource,     useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockLedger.recordTransaction.mockResolvedValue({});
    });

    // ─── calculate() ────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 to transaction amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
        });

        it('applies 0.5% default commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5,  8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('works for dust amounts (0.000001)', () => {
            const result = service.calculate(0.000001);
            expect(result.emissionAmount).toBeCloseTo(0.000001, 12);
        });
    });

    // ─── processTransactionEmission() ───────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records four ledger operations in order: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(500, 'ADDR_1', 'REF_A');

            const calls = mockLedger.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);
            expect(calls[0][0].type).toBe('MINT');
            expect(calls[1][0].type).toBe('FEE_DISTRIBUTION');
            expect(calls[2][0].type).toBe('FEE_DISTRIBUTION');
            expect(calls[3][0].type).toBe('BURN');
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(200, 'ADDR_1', 'REF_B');
            const mintCall = mockLedger.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(200, 6);
        });

        it('BURN amount equals emission amount (ARO destroyed after TX)', async () => {
            await service.processTransactionEmission(200, 'ADDR_1', 'REF_C');
            const burnCall = mockLedger.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBeCloseTo(200, 6);
        });

        it('returns an EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(1_000, 'ADDR_1', 'REF_D');
            expect(result.emissionAmount).toBe(1_000);
            expect(result.commission).toBeCloseTo(5, 8);
            expect(result.nodeShare).toBeCloseTo(3.75, 8);
            expect(result.afcReserveShare).toBeCloseTo(1.25, 8);
        });

        it('commits the transaction on success', async () => {
            await service.processTransactionEmission(100, 'ADDR_1', 'REF_E');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedger.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(100, 'ADDR_1', 'REF_F'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });

    // ─── AFC reserve & price index ───────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('starts at reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after each transaction (monotonic)', async () => {
            const p1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'ADDR_1', 'REF_G');
            const p2 = service.getCurrentEmissionPrice();
            expect(p2).toBeGreaterThan(p1);
        });

        it('reserveIndex never decreases across multiple transactions', async () => {
            const prices: number[] = [service.getCurrentEmissionPrice()];
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(5_000, 'ADDR_1', `REF_H${i}`);
                prices.push(service.getCurrentEmissionPrice());
            }
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });

        it('reserveIndex formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // A $10,000 TX → afcShare = 10_000 * 0.005 * 0.25 = 12.5
            await service.processTransactionEmission(10_000, 'ADDR_1', 'REF_I');
            const expectedIndex = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expectedIndex, 8);
        });
    });

    // ─── governance ──────────────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('applies new rate to subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('rejects rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
