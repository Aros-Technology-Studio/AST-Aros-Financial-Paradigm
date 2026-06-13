import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
    manager: { find: jest.fn().mockResolvedValue([]), save: jest.fn().mockResolvedValue({}) },
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_TX' });
    });

    describe('calculate() — canonical 1:1 model', () => {
        it('emits exactly the transaction amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);   // 75%
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8); // 25%
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

        it('dust amount: $0.01 transaction', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBe(0.01);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });
    });

    describe('processTransactionEmission() — full canonical lifecycle', () => {
        it('records MINT, two FEE_DISTRIBUTION, and BURN ledger entries', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            // 4 ledger operations: MINT, FEE_DIST×2, BURN
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls;
            const types = calls.map((c: any[]) => c[0].type);
            // TransactionType enum: MINT='MINT', FEE_DISTRIBUTION='FEE', BURN='BURN'
            expect(types).toContain('MINT');
            expect(types).toContain('FEE');   // TransactionType.FEE_DISTRIBUTION = 'FEE'
            expect(types).toContain('BURN');
            expect(types.filter((t: string) => t === 'FEE').length).toBe(2);
        });

        it('mint amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(5_000, 'ADDR', 'REF_002');

            const mintCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].type === 'MINT',
            );
            expect(mintCall).toBeDefined();
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(5_000, 4);
        });

        it('burn amount equals mint amount (net-zero supply)', async () => {
            await service.processTransactionEmission(5_000, 'ADDR', 'REF_003');

            const mintCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].type === 'MINT',
            );
            const burnCall = mockLedgerService.recordTransaction.mock.calls.find(
                (c: any[]) => c[0].type === 'BURN',
            );
            expect(mintCall[0].amount).toBe(burnCall[0].amount);
        });

        it('commits transaction on success', async () => {
            await service.processTransactionEmission(1_000, 'ADDR', 'REF_004');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back on ledger error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger down'));
            await expect(
                service.processTransactionEmission(1_000, 'ADDR', 'REF_005'),
            ).rejects.toThrow('ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });

    describe('AFC reserve state', () => {
        it('starts at index 1.0 with zero reserve', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });

        it('reserve index rises monotonically after each emission', async () => {
            const price0 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_06');
            const price1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_07');
            const price2 = service.getCurrentEmissionPrice();

            expect(price1).toBeGreaterThan(price0);
            expect(price2).toBeGreaterThan(price1);
        });

        it('index formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // $10,000 TX → commission = 50 → afcShare = 12.5
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_08');
            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expectedIndex, 10);
        });

        it('getAfcReserveState returns a snapshot (not a live reference)', async () => {
            const snapshot = service.getAfcReserveState();
            await service.processTransactionEmission(10_000, 'ADDR', 'REF_09');
            // snapshot must not mutate
            expect(snapshot.totalReserve).toBe(0);
        });
    });

    describe('updateCommissionRate()', () => {
        it('applies new rate to subsequent calculate() calls', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });
    });
});
