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

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emissionAmount equals transactionAmount (1:1)', () => {
            const result = service.calculate(10000);
            expect(result.emissionAmount).toBe(10000);
            expect(result.transactionAmount).toBe(10000);
        });

        it('commission = txAmount × default rate (0.5%)', () => {
            const result = service.calculate(10000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('nodeShare = commission × 0.75', () => {
            const result = service.calculate(10000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare = commission × 0.25', () => {
            const result = service.calculate(10000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare == commission (no rounding loss)', () => {
            const result = service.calculate(10000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('respects custom commission rate', () => {
            const result = service.calculate(1000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts correctly', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeCloseTo(0.00000001 * 0.005, 16);
        });
    });

    // ─── getAfcReserveState() ─────────────────────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('initial reserveIndex is 1.0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
        });

        it('returns a snapshot — mutations do not affect internal state', () => {
            const state = service.getAfcReserveState() as any;
            state.totalReserve = 999999;
            expect(service.getAfcReserveState().totalReserve).toBe(0);
        });
    });

    // ─── getCurrentEmissionPrice() ────────────────────────────────────────────

    describe('getCurrentEmissionPrice()', () => {
        it('initial price is 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ─── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the default commission rate', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws on rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ─── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('executes 4 ledger operations for a canonical TX', async () => {
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');

            // MINT + FEE_DISTRIBUTION×2 + BURN = 4 calls
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first ledger call is MINT for emissionAmount', async () => {
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');

            const firstCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(firstCall.type).toBe(TransactionType.MINT);
            expect(parseFloat(firstCall.amount)).toBeCloseTo(10000, 4);
            expect(firstCall.recipient).toBe('RECIPIENT_1');
        });

        it('last ledger call is BURN for emissionAmount (ARO are transient)', async () => {
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');

            const lastCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(lastCall.type).toBe(TransactionType.BURN);
            expect(parseFloat(lastCall.amount)).toBeCloseTo(10000, 4);
        });

        it('second call distributes 75% commission to NODE_POOL', async () => {
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');

            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 4);
            expect(nodeCall.recipient).toContain('NODE_POOL');
        });

        it('third call distributes 25% commission to AFC_RESERVE', async () => {
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');

            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 4);
            expect(afcCall.recipient).toContain('AFC_RESERVE');
        });

        it('AFC reserve grows and reserveIndex rises after a TX', async () => {
            const before = service.getAfcReserveState().reserveIndex;
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');
            const after = service.getAfcReserveState().reserveIndex;
            expect(after).toBeGreaterThan(before);
        });

        it('reserveIndex formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // After one TX of 10000 at 0.5% rate: afcShare = 12.5
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 10);
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_ERR'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('always releases the query runner (finally block)', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('fail'));

            await expect(
                service.processTransactionEmission(500, 'REC', 'REF'),
            ).rejects.toThrow();

            expect(mockQueryRunner.release).toHaveBeenCalled();
        });

        it('supply snapshot: totalMinted and totalBurned both increase (net zero)', async () => {
            await service.processTransactionEmission(10000, 'RECIPIENT_1', 'REF_001');

            const saveCall = mockQueryRunner.manager.save.mock.calls[0];
            const snapshot = saveCall[1];
            expect(parseFloat(snapshot.totalMinted)).toBeCloseTo(10000, 4);
            expect(parseFloat(snapshot.totalBurned)).toBeCloseTo(10000, 4);
            // circulatingSupply unchanged (mint and burn cancel out)
            expect(parseFloat(snapshot.circulatingSupply)).toBeCloseTo(0, 4);
        });
    });
});
