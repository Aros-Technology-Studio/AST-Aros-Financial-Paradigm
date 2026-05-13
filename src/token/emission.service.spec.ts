import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
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

describe('EmissionService — Canonical 1:1 Model', () => {
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

        // Reset query runner mock after clear
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    // ── calculate() ────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 for a $10,000 transaction', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
        });

        it('commission = txAmount × 0.5% (default rate)', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('node share = 75% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('AFC reserve share = 25% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('node share + AFC share == total commission (no dust loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 10);
        });

        it('respects a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-1)).toThrow(BadRequestException);
        });

        it('works for dust amounts', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBe(0.00000001);
            expect(result.commission).toBeGreaterThan(0);
        });
    });

    // ── AFC reserve index ───────────────────────────────────────────────────────

    describe('getAfcReserveState() / getCurrentEmissionPrice()', () => {
        it('starts with reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises after processTransactionEmission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_1');
            expect(service.getCurrentEmissionPrice()).toBeGreaterThan(1.0);
        });

        it('index = 1.0 + sqrt(totalReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_2');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 10);
        });

        it('reserveIndex is monotonically non-decreasing over multiple TXs', async () => {
            let prev = service.getCurrentEmissionPrice();
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(1_000, 'RECIPIENT', `REF_MON_${i}`);
                const curr = service.getCurrentEmissionPrice();
                expect(curr).toBeGreaterThanOrEqual(prev);
                prev = curr;
            }
        });
    });

    // ── processTransactionEmission() ───────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records exactly 4 ledger operations per TX cycle', async () => {
            await service.processTransactionEmission(500, 'REC', 'REF_4');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first call is a MINT for the full emission amount', async () => {
            await service.processTransactionEmission(500, 'REC', 'REF_5');
            const firstCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(firstCall.type).toBe(TransactionType.MINT);
            expect(parseFloat(firstCall.amount)).toBeCloseTo(500, 8);
        });

        it('second call is FEE_DISTRIBUTION for 75% node share', async () => {
            await service.processTransactionEmission(500, 'REC', 'REF_6');
            const secondCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(secondCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            // 500 * 0.005 * 0.75 = 1.875
            expect(parseFloat(secondCall.amount)).toBeCloseTo(1.875, 6);
        });

        it('third call is FEE_DISTRIBUTION for 25% AFC share', async () => {
            await service.processTransactionEmission(500, 'REC', 'REF_7');
            const thirdCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(thirdCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            // 500 * 0.005 * 0.25 = 0.625
            expect(parseFloat(thirdCall.amount)).toBeCloseTo(0.625, 6);
        });

        it('fourth call is a BURN for the full emission amount (transient supply)', async () => {
            await service.processTransactionEmission(500, 'REC', 'REF_8');
            const fourthCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(fourthCall.type).toBe(TransactionType.BURN);
            expect(parseFloat(fourthCall.amount)).toBeCloseTo(500, 8);
        });

        it('rolls back all ledger ops on failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(500, 'REC', 'REF_FAIL'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('net supply snapshot: totalMinted == totalBurned (net zero circulating change)', async () => {
            const capturedSnapshots: any[] = [];
            mockQueryRunner.manager.save.mockImplementation((_entity: any, snapshot: any) => {
                capturedSnapshots.push(snapshot);
                return Promise.resolve(snapshot);
            });

            await service.processTransactionEmission(1_000, 'REC', 'REF_NET');

            const snap = capturedSnapshots[0];
            expect(parseFloat(snap.totalMinted)).toBeCloseTo(parseFloat(snap.totalBurned), 6);
        });
    });

    // ── updateCommissionRate() ──────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate and updates commission in next calculate()', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws on rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
