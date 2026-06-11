import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockQueryRunner = {
    connect:             jest.fn(),
    startTransaction:    jest.fn(),
    commitTransaction:   jest.fn(),
    rollbackTransaction: jest.fn(),
    release:             jest.fn(),
    manager: {
        find: jest.fn(),
        save: jest.fn(),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_HASH' }),
};

const mockSupplyRepo = {
    find:    jest.fn(),
    findOne: jest.fn(),
    save:    jest.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

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
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    // ── calculate() — canonical 1:1 model ───────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly 1:1 for a standard amount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies the default 0.5% commission rate', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% to nodes, 25% to AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('burnAmount = emissionAmount − commission (prevents ledger deficit)', () => {
            const result = service.calculate(10_000);
            // After paying commission, recipient holds 9,950 — that is what gets burned.
            expect(result.burnAmount).toBeCloseTo(9_950, 4);
            expect(result.burnAmount).toBeCloseTo(result.emissionAmount - result.commission, 8);
        });

        it('nodeShare + afcReserveShare === commission for arbitrary amounts', () => {
            const cases = [1, 99.99, 1_000_000, 0.000001];
            for (const amount of cases) {
                const r = service.calculate(amount);
                expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
            }
        });

        it('burnAmount + commission === emissionAmount for arbitrary amounts', () => {
            const cases = [100, 5_000, 250_000];
            for (const amount of cases) {
                const r = service.calculate(amount);
                expect(r.burnAmount + r.commission).toBeCloseTo(r.emissionAmount, 8);
            }
        });

        it('respects a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.burnAmount).toBeCloseTo(990, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('dust amount: emission still equals tx amount (1:1)', () => {
            const result = service.calculate(0.000001);
            expect(result.emissionAmount).toBe(0.000001);
        });
    });

    // ── getAfcReserveState() — initial state ─────────────────────────────────

    describe('getAfcReserveState()', () => {
        it('starts at reserveIndex = 1.0 with zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });
    });

    // ── getCurrentEmissionPrice() ────────────────────────────────────────────

    describe('getCurrentEmissionPrice()', () => {
        it('returns 1.0 before any transactions', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });
    });

    // ── updateCommissionRate() ───────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates rate and affects subsequent calculate() calls', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.burnAmount).toBeCloseTo(990, 8);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(-0.1)).toThrow(BadRequestException);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() — full lifecycle ────────────────────────

    describe('processTransactionEmission()', () => {
        it('records four ledger entries in order: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls).toHaveLength(4);
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('mints the exact transaction amount (1:1)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('burns burnAmount (emissionAmount − commission), not full emissionAmount', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            const calls    = mockLedgerService.recordTransaction.mock.calls;
            const mintAmt  = parseFloat(calls[0][0].amount); // 10,000
            const burnAmt  = parseFloat(calls[3][0].amount); // 9,950 (not 10,000)
            const feeAmt   = parseFloat(calls[1][0].amount) + parseFloat(calls[2][0].amount); // 50
            expect(burnAmt).toBeCloseTo(mintAmt - feeAmt, 4); // burn = emit - fee
            expect(burnAmt).toBeCloseTo(9_950, 4);
        });

        it('distributes 75% to node pool and 25% to AFC reserve', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            const calls    = mockLedgerService.recordTransaction.mock.calls;
            const nodeShare = parseFloat(calls[1][0].amount);
            const afcShare  = parseFloat(calls[2][0].amount);
            expect(nodeShare).toBeCloseTo(37.5, 4);
            expect(afcShare).toBeCloseTo(12.5, 4);
        });

        it('grows AFC reserve index after each transaction', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('AFC reserve index is monotonically non-decreasing across multiple TXs', async () => {
            let prev = service.getCurrentEmissionPrice();
            for (let i = 0; i < 5; i++) {
                await service.processTransactionEmission(1_000, `REC_${i}`, `REF_${i}`);
                const curr = service.getCurrentEmissionPrice();
                expect(curr).toBeGreaterThanOrEqual(prev);
                prev = curr;
            }
        });

        it('rolls back on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(10_000, 'REC', 'REF_ERR'),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('returns an EmissionResult with all canonical fields including burnAmount', async () => {
            const result = await service.processTransactionEmission(10_000, 'REC', 'REF_001');
            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 4);
            expect(result.nodeShare).toBeCloseTo(37.5, 4);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 4);
            expect(result.burnAmount).toBeCloseTo(9_950, 4);
        });
    });
});
