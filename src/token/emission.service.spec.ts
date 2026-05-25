import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_HASH', ledgerHeight: '1' }),
};

const mockSupplyRepo = {
    find:    jest.fn(),
    findOne: jest.fn(),
    save:    jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EmissionService — canonical 1:1 model', () => {
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
        // Restore default mocks after clearAllMocks
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue({});
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_HASH', ledgerHeight: '1' });
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly 1:1 (emission = transactionAmount)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBeCloseTo(0.005);
            expect(result.commission).toBeCloseTo(50);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5);          // 50 × 0.75
            expect(result.afcReserveShare).toBeCloseTo(12.5);    // 50 × 0.25
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission);
        });

        it('respects a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10);
            expect(result.nodeShare).toBeCloseTo(7.5);
            expect(result.afcReserveShare).toBeCloseTo(2.5);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts without throwing', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBeCloseTo(0.00000001);
        });
    });

    // ── processTransactionEmission() ─────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('calls ledger MINT → NODE_FEE → AFC_FEE → BURN in that order', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);
            expect(calls[0][0].type).toBe('MINT');
            expect(calls[1][0].metadata.operation).toBe('NODE_FEE_75PCT');
            expect(calls[2][0].metadata.operation).toBe('AFC_RESERVE_25PCT');
            expect(calls[3][0].type).toBe('BURN');
        });

        it('passes the same QueryRunner to every ledger call (true atomicity)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF_002');

            const qr = mockDataSource.createQueryRunner.mock.results[0].value;
            mockLedgerService.recordTransaction.mock.calls.forEach(call => {
                expect(call[1]).toBe(qr);
            });
        });

        it('mints and burns the same amount (net circulating = 0)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF_003');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(mintCall.amount).toBe(burnCall.amount);                   // both "10000.00000000"
            expect(mintCall.recipient).not.toBe(burnCall.recipient);         // different destinations
        });

        it('updates AFC reserve state after successful emission', async () => {
            const before = service.getAfcReserveState();
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF_004');
            const after = service.getAfcReserveState();

            expect(after.totalReserve).toBeGreaterThan(before.totalReserve);
            expect(after.reserveIndex).toBeGreaterThanOrEqual(before.reserveIndex);
            expect(after.transactionCount).toBe(before.transactionCount + 1);
        });

        it('rolls back in-memory AFC state when DB transaction fails', async () => {
            const reserveBefore = service.getAfcReserveState().totalReserve;

            // Simulate DB failure on the BURN step (4th ledger call)
            mockLedgerService.recordTransaction
                .mockResolvedValueOnce({ hash: 'H1' }) // MINT
                .mockResolvedValueOnce({ hash: 'H2' }) // NODE_FEE
                .mockResolvedValueOnce({ hash: 'H3' }) // AFC_FEE
                .mockRejectedValueOnce(new Error('DB failure on BURN'));

            await expect(
                service.processTransactionEmission(5_000, 'RECIPIENT', 'TX_REF_FAIL'),
            ).rejects.toThrow('DB failure on BURN');

            // In-memory AFC state must be restored to pre-emission value
            expect(service.getAfcReserveState().totalReserve).toBeCloseTo(reserveBefore);
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('commits the queryRunner on success', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'TX_REF_OK');
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });
    });

    // ── AFC reserve price index ───────────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('starts at 1.0 (no reserve accumulated)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('grows monotonically with each emission', async () => {
            const prices: number[] = [];
            for (let i = 0; i < 3; i++) {
                await service.processTransactionEmission(10_000, 'REC', `REF_${i}`);
                prices.push(service.getCurrentEmissionPrice());
            }
            expect(prices[1]).toBeGreaterThanOrEqual(prices[0]);
            expect(prices[2]).toBeGreaterThanOrEqual(prices[1]);
        });

        it('follows formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'REC', 'REF_FORMULA');
            const state = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 10);
        });
    });

    // ── updateCommissionRate() ────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts valid rates', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBeCloseTo(0.01);
        });

        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });
});
