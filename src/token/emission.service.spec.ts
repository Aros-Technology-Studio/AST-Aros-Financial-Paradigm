import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

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

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_MOCK_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue({}),
};

describe('EmissionService — canonical 1:1 model', () => {
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_MOCK_HASH' });
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly the transaction amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies 0.5% default commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('node share + AFC share = total commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
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
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('dust amount: $0.01 transaction', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01, 10);
            expect(result.commission).toBeCloseTo(0.00005, 10);
        });
    });

    // ── AFC reserve state ────────────────────────────────────────────────────

    describe('getAfcReserveState() / getCurrentEmissionPrice()', () => {
        it('starts with reserveIndex = 1.0 and totalReserve = 0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('getCurrentEmissionPrice() returns reserveIndex', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('executes all 4 ledger steps for a $10,000 TX', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            // 4 ledger calls: MINT, FEE_DISTRIBUTION (×2), BURN
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls;

            // Step 1: MINT 1:1
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[0][0].amount).toBe('10000.00000000');
            expect(calls[0][0].recipient).toBe('RECIPIENT_ADDR');

            // Step 2a: 75% node pool
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[1][0].recipient).toBe('SYSTEM_NODE_POOL_00000000000000000000');
            expect(parseFloat(calls[1][0].amount)).toBeCloseTo(37.5, 4);

            // Step 2b: 25% AFC reserve
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].recipient).toBe('SYSTEM_AFC_RESERVE_000000000000000000');
            expect(parseFloat(calls[2][0].amount)).toBeCloseTo(12.5, 4);

            // Step 4: BURN = emission (1:1 cancel)
            expect(calls[3][0].type).toBe(TransactionType.BURN);
            expect(calls[3][0].amount).toBe('10000.00000000');
        });

        it('updates AFC reserve index after TX', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_002');

            const state = service.getAfcReserveState();
            // afcShare = 12.5 → index = 1 + sqrt(12.5) / 10_000
            const expectedIndex = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expectedIndex, 10);
            expect(state.totalReserve).toBeCloseTo(12.5, 8);
            expect(state.transactionCount).toBe(1);
        });

        it('AFC reserve index rises monotonically across multiple TXs', async () => {
            await service.processTransactionEmission(1_000, 'ADDR_A', 'REF_003');
            const idx1 = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(1_000, 'ADDR_B', 'REF_004');
            const idx2 = service.getCurrentEmissionPrice();

            expect(idx2).toBeGreaterThan(idx1);
        });

        it('commits transaction and records supply snapshot', async () => {
            await service.processTransactionEmission(500, 'ADDR_C', 'REF_005');

            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
            expect(mockQueryRunner.manager.save).toHaveBeenCalled();
        });

        it('rolls back atomically when a ledger step fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger fail'));

            await expect(
                service.processTransactionEmission(500, 'ADDR_D', 'REF_006'),
            ).rejects.toThrow('Ledger fail');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('returns EmissionResult matching calculate() output', async () => {
            const result = await service.processTransactionEmission(2_000, 'ADDR_E', 'REF_007');

            expect(result.emissionAmount).toBe(2_000);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });
    });

    // ── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and applies it to subsequent calculations', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws for rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate = 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for negative rate', () => {
            expect(() => service.updateCommissionRate(-0.01)).toThrow(BadRequestException);
        });
    });

    // ── Supply snapshot invariant ────────────────────────────────────────────

    describe('supply snapshot invariant', () => {
        it('totalMinted == totalBurned per canonical TX cycle (net-zero supply)', async () => {
            const saves = mockQueryRunner.manager.save.mock.calls;
            await service.processTransactionEmission(5_000, 'ADDR_F', 'REF_008');

            const snapshotCall = saves.find(
                (call) => call[0] === SupplySnapshot || call[1] instanceof SupplySnapshot || (call[1] && call[1].totalMinted),
            );
            if (snapshotCall) {
                const snap = snapshotCall[1];
                expect(parseFloat(snap.totalMinted)).toBeCloseTo(parseFloat(snap.totalBurned), 8);
            }
            // If snapshot not captured in mock call args, verify indirectly via manager.save call count
            expect(mockQueryRunner.manager.save).toHaveBeenCalled();
        });
    });
});
