import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

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

    // ── calculate() ─────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('enforces 1:1 emission — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission: 75% nodes, 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('accepts custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('handles small (dust) amounts without negative values', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeGreaterThanOrEqual(0);
            expect(result.nodeShare).toBeGreaterThanOrEqual(0);
            expect(result.afcReserveShare).toBeGreaterThanOrEqual(0);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('nodeShare + afcReserveShare equals commission exactly', () => {
            [1, 100, 9999.99, 1_000_000].forEach(amount => {
                const r = service.calculate(amount);
                expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
            });
        });
    });

    // ── AFC reserve index ────────────────────────────────────────────────────

    describe('AFC reserve index', () => {
        it('starts at 1.0 (no reserve accumulated yet)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('rises monotonically as transactions are processed', async () => {
            const price0 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(10_000, 'ADDR_A', 'REF_1');
            const price1 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(10_000, 'ADDR_B', 'REF_2');
            const price2 = service.getCurrentEmissionPrice();

            expect(price1).toBeGreaterThan(price0);
            expect(price2).toBeGreaterThan(price1);
        });

        it('follows the formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_X', 'REF_IDX');

            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 10);
        });

        it('getAfcReserveState returns read-only snapshot', () => {
            const snap = service.getAfcReserveState();
            expect(snap).toHaveProperty('totalReserve');
            expect(snap).toHaveProperty('reserveIndex');
            expect(snap).toHaveProperty('transactionCount');
            expect(snap).toHaveProperty('lastUpdated');
        });
    });

    // ── processTransactionEmission() ────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records exactly 4 ledger operations per TX (MINT, 2× FEE_DISTRIBUTION, BURN)', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_4OPS');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF_MINT');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(mintCall.type).toBe('MINT');
            expect(parseFloat(mintCall.amount)).toBeCloseTo(5_000);
        });

        it('BURN amount equals emission amount (full burn after TX)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF_BURN');

            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(burnCall.type).toBe('BURN');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(5_000);
        });

        it('node pool receives 75% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_75');

            const nodeFeeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeFeeCall.type).toBe('FEE_DISTRIBUTION');
            expect(nodeFeeCall.recipient).toBe('SYSTEM_NODE_POOL_00000000000000000000');
            expect(parseFloat(nodeFeeCall.amount)).toBeCloseTo(37.5); // 10000*0.005*0.75
        });

        it('AFC reserve receives 25% of commission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_25');

            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.type).toBe('FEE_DISTRIBUTION');
            expect(afcCall.recipient).toBe('SYSTEM_AFC_RESERVE_000000000000000000');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5); // 10000*0.005*0.25
        });

        it('commits the QueryRunner transaction on success', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_COMMIT');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger down'));

            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_ROLLBACK'),
            ).rejects.toThrow('ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('net circulating supply change is zero (mint and burn cancel)', async () => {
            await service.processTransactionEmission(8_000, 'RECIPIENT', 'REF_NET');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];

            expect(parseFloat(mintCall.amount)).toBeCloseTo(parseFloat(burnCall.amount));
        });

        it('releases the QueryRunner in all cases', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF_RELEASE');
            expect(mockQueryRunner.release).toHaveBeenCalled();
        });
    });

    // ── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the commission rate used in subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1 or more', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });
});
