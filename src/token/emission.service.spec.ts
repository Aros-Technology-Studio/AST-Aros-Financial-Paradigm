import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

const DEFAULT_RATE = 0.005;
const NODE_RATIO   = 0.75;
const AFC_RATIO    = 0.25;

const mockSupplyRepo = { find: jest.fn(), save: jest.fn() };
const mockLedgerService = { recordTransaction: jest.fn() };
const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { find: jest.fn(), save: jest.fn() },
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

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ──────────────────────────────────────────────────────────────────
    // calculate() — canonical invariants
    // ──────────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(DEFAULT_RATE);
        });

        it('splits commission 75% nodes / 25% AFC — $10,000 example', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare equals commission (no rounding loss)', () => {
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

        it('handles dust amounts correctly (0.01 ARO)', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBeCloseTo(0.01, 10);
            expect(result.commission).toBeCloseTo(0.01 * DEFAULT_RATE, 10);
            expect(result.nodeShare).toBeCloseTo(result.commission * NODE_RATIO, 10);
            expect(result.afcReserveShare).toBeCloseTo(result.commission * AFC_RATIO, 10);
        });

        it('handles large amounts (1,000,000 ARO)', () => {
            const result = service.calculate(1_000_000);
            expect(result.emissionAmount).toBe(1_000_000);
            expect(result.commission).toBeCloseTo(5_000, 8);
            expect(result.nodeShare).toBeCloseTo(3_750, 8);
            expect(result.afcReserveShare).toBeCloseTo(1_250, 8);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // AFC reserve state
    // ──────────────────────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts with reserveIndex = 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns a snapshot — mutations do not affect internal state', () => {
            const state = service.getAfcReserveState() as any;
            state.totalReserve = 9_999_999;
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('starts at 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    describe('updateCommissionRate()', () => {
        it('updates the commission rate applied by calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws for rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate = 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate > 1', () => {
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // processTransactionEmission() — full lifecycle (mocked ledger)
    // ──────────────────────────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        beforeEach(() => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
            mockQueryRunner.manager.find.mockResolvedValue([]);
            mockQueryRunner.manager.save.mockResolvedValue({});
        });

        it('records 4 ledger operations: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_001');

            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('mints the correct 1:1 emission amount', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_002');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(mintCall.amount).toBe('10000.00000000');
            expect(mintCall.metadata.operation).toBe('CANONICAL_1_1_EMISSION');
        });

        it('burns the same amount that was minted', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_003');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(burnCall.amount).toBe(mintCall.amount);
            expect(burnCall.metadata.operation).toBe('POST_TX_CANONICAL_BURN');
        });

        it('grows AFC reserveIndex after emission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_004');
            expect(service.getAfcReserveState().totalReserve).toBeGreaterThan(0);
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });

        it('returns the correct EmissionResult', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_005');
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('rolls back all ledger ops when a step fails', async () => {
            mockLedgerService.recordTransaction
                .mockResolvedValueOnce({ hash: 'TX1' })  // MINT ok
                .mockResolvedValueOnce({ hash: 'TX2' })  // FEE_NODE ok
                .mockRejectedValueOnce(new Error('AFC ledger failure')); // FEE_AFC fails

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_ADDR', 'REF_FAIL'),
            ).rejects.toThrow('AFC ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });
    });
});
