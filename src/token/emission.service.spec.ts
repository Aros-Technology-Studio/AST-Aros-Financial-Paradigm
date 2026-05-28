import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
        mockQueryRunner.manager.save.mockResolvedValue({});
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    describe('calculate() — canonical 1:1 formula', () => {
        it('emission equals transaction amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('commission = txAmount × 0.5% (default rate)', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('nodeShare = commission × 75%', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare = commission × 25%', () => {
            const result = service.calculate(10_000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.nodeShare).toBeCloseTo(75, 8);
            expect(result.afcReserveShare).toBeCloseTo(25, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('dust amount: $0.01 transaction still emits 1:1', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01, 10);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });
    });

    describe('AFC reserve index', () => {
        it('initial reserveIndex is 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex grows after updateAfcReserve()', () => {
            service.updateAfcReserve(10_000);
            const index = service.getCurrentEmissionPrice();
            // Expected: 1.0 + sqrt(10000) / 10000 = 1.0 + 100/10000 = 1.01
            expect(index).toBeCloseTo(1.01, 6);
        });

        it('reserveIndex is monotonically non-decreasing', () => {
            service.updateAfcReserve(100);
            const i1 = service.getCurrentEmissionPrice();
            service.updateAfcReserve(100);
            const i2 = service.getCurrentEmissionPrice();
            service.updateAfcReserve(100);
            const i3 = service.getCurrentEmissionPrice();
            expect(i2).toBeGreaterThanOrEqual(i1);
            expect(i3).toBeGreaterThanOrEqual(i2);
        });

        it('getAfcReserveState returns immutable snapshot', () => {
            service.updateAfcReserve(500);
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(500);
            expect(state.transactionCount).toBe(1);
        });
    });

    describe('updateCommissionRate()', () => {
        it('accepts valid rate and applies to next calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws for rate === 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate === 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate > 1', () => {
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    describe('processTransactionEmission() — full lifecycle', () => {
        it('records MINT, two FEE_DISTRIBUTION, and BURN ledger entries', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_001');

            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls.map((c: any[]) => c[0]);
            const types = calls.map((c: any) => c.type);

            expect(types).toContain(TransactionType.MINT);
            expect(types.filter((t: string) => t === TransactionType.FEE_DISTRIBUTION)).toHaveLength(2);
            expect(types).toContain(TransactionType.BURN);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_002');

            const mintCall = mockLedgerService.recordTransaction.mock.calls
                .map((c: any[]) => c[0])
                .find((c: any) => c.type === TransactionType.MINT);

            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('BURN amount equals emitted amount (transient supply)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_003');

            const burnCall = mockLedgerService.recordTransaction.mock.calls
                .map((c: any[]) => c[0])
                .find((c: any) => c.type === TransactionType.BURN);

            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('AFC reserve contribution is 25% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_004');

            const afcCall = mockLedgerService.recordTransaction.mock.calls
                .map((c: any[]) => c[0])
                .find((c: any) => c.metadata?.operation === 'AFC_RESERVE_25PCT');

            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 4);
        });

        it('node pool contribution is 75% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_005');

            const nodeCall = mockLedgerService.recordTransaction.mock.calls
                .map((c: any[]) => c[0])
                .find((c: any) => c.metadata?.operation === 'NODE_FEE_75PCT');

            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 4);
        });

        it('rolls back all ledger entries on failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_A', 'TX_REF_FAIL'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('returns EmissionResult with correct fields', async () => {
            const result = await service.processTransactionEmission(5_000, 'RECIPIENT_B', 'TX_REF_006');

            expect(result.transactionAmount).toBe(5_000);
            expect(result.emissionAmount).toBe(5_000);
            expect(result.commission).toBeCloseTo(25, 8);
            expect(result.nodeShare).toBeCloseTo(18.75, 8);
            expect(result.afcReserveShare).toBeCloseTo(6.25, 8);
        });
    });
});
