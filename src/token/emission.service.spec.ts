import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockSupplyRepo = {
    find:    jest.fn(),
    findOne: jest.fn(),
    save:    jest.fn(),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockQueryRunner = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
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
                { provide: LedgerService,                      useValue: mockLedgerService },
                { provide: DataSource,                         useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue({});
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculate() — pure function ───────────────────────────────────────────

    describe('calculate()', () => {
        it('returns emission equal to transaction amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission 75% nodes / 25% AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
        });

        it('nodeShare + afcReserveShare === commission (no leakage)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('respects custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('handles dust amounts without throwing', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });
    });

    // ─── AFC reserve state ──────────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts with reserveIndex 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('returns a snapshot (mutations do not affect internal state)', () => {
            const state = service.getAfcReserveState() as any;
            state.reserveIndex = 999;
            expect(service.getAfcReserveState().reserveIndex).toBe(1.0);
        });
    });

    describe('getCurrentEmissionPrice()', () => {
        it('equals initial reserveIndex of 1.0 before any transactions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ─── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the default commission rate used by calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() — full lifecycle ─────────────────────────

    describe('processTransactionEmission()', () => {
        it('executes all four ledger steps: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(10_000, 'WALLET_A', 'REF_001');

            const calls: string[] = mockLedgerService.recordTransaction.mock.calls.map(
                (c: any[]) => c[0].type,
            );

            expect(calls).toContain(TransactionType.MINT);
            expect(calls).toContain(TransactionType.FEE_DISTRIBUTION);
            expect(calls).toContain(TransactionType.BURN);
            // 4 total ledger operations: MINT + 2×FEE_DISTRIBUTION + BURN
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('commits the database transaction on success', async () => {
            await service.processTransactionEmission(10_000, 'WALLET_A', 'REF_002');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('DB failure'));

            await expect(
                service.processTransactionEmission(10_000, 'WALLET_A', 'REF_003'),
            ).rejects.toThrow('DB failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });

        it('grows AFC reserve index after each transaction', async () => {
            await service.processTransactionEmission(10_000, 'WALLET_A', 'REF_004');
            const priceAfterFirst = service.getCurrentEmissionPrice();
            expect(priceAfterFirst).toBeGreaterThan(1.0);

            await service.processTransactionEmission(10_000, 'WALLET_A', 'REF_005');
            const priceAfterSecond = service.getCurrentEmissionPrice();
            expect(priceAfterSecond).toBeGreaterThan(priceAfterFirst);
        });

        it('returns EmissionResult with correct 1:1 emissionAmount', async () => {
            const result = await service.processTransactionEmission(5_000, 'WALLET_B', 'REF_006');
            expect(result.emissionAmount).toBe(5_000);
        });

        it('throws BadRequestException for non-positive amount', async () => {
            await expect(
                service.processTransactionEmission(0, 'WALLET_C', 'REF_007'),
            ).rejects.toThrow(BadRequestException);
        });

        it('releases queryRunner even on error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('fail'));
            await expect(
                service.processTransactionEmission(1, 'WALLET_D', 'REF_008'),
            ).rejects.toThrow();
            expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
        });
    });

    // ─── Invariant: $10k example from canonical spec ───────────────────────────

    describe('Canonical example: $10,000 transaction', () => {
        it('satisfies all canonical invariants', () => {
            const result = service.calculate(10_000);

            // Emission = TX Amount (1:1)
            expect(result.emissionAmount).toBe(result.transactionAmount);

            // Commission = 0.5%
            expect(result.commission).toBeCloseTo(50);

            // Nodes = 75%
            expect(result.nodeShare).toBeCloseTo(37.5);

            // AFC = 25%
            expect(result.afcReserveShare).toBeCloseTo(12.5);

            // No leakage in split
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });
    });
});
