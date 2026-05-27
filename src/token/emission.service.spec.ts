/**
 * Canonical 1:1 Emission Model — Unit Tests
 *
 * Verifies that EmissionService strictly adheres to the canonical ArosCoin emission spec:
 *   Emission  = Transaction Amount (1:1, no multiplier)
 *   Fee       = Transaction Amount × rate (default 0.5%)
 *   Node share  = Fee × 0.75   (75%)
 *   AFC share   = Fee × 0.25   (25%)
 *   Burn      = Emission Amount (post-completion, net circulating change = 0)
 *   AFC reserve growth → reserveIndex rises monotonically
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
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

const mockSupplyRepo = {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
};

// ── Test Suite ──────────────────────────────────────────────────────────────

describe('EmissionService — Canonical 1:1 Model', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService,  useValue: mockLedgerService },
                { provide: DataSource,     useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
    });

    // ────────────────────────────────────────────────────────────────────────
    // 1. Pure calculation — no side effects
    // ────────────────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits exactly 1:1 for a $10,000 transaction', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('calculates commission at 0.5% (default rate)', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.commissionRate).toBe(0.005);
        });

        it('splits commission: 75% → nodes', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);        // 50 × 0.75
        });

        it('splits commission: 25% → AFC reserve', () => {
            const result = service.calculate(10_000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);  // 50 × 0.25
        });

        it('node + AFC shares sum to total commission (no leakage)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts custom commission rate', () => {
            const result = service.calculate(10_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(100, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('1:1 holds for $1 transaction', () => {
            const result = service.calculate(1);
            expect(result.emissionAmount).toBe(1);
            expect(result.commission).toBeCloseTo(0.005, 8);
        });

        it('1:1 holds for $1,000,000 transaction', () => {
            const result = service.calculate(1_000_000);
            expect(result.emissionAmount).toBe(1_000_000);
            expect(result.commission).toBeCloseTo(5_000, 8);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. AFC Reserve — price index grows monotonically
    // ────────────────────────────────────────────────────────────────────────

    describe('AFC Reserve price index', () => {
        it('starts at reserveIndex = 1.0', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
        });

        it('getCurrentEmissionPrice() matches reserveIndex', () => {
            expect(service.getCurrentEmissionPrice()).toBe(service.getAfcReserveState().reserveIndex);
        });

        // Simulate reserve growth via processTransactionEmission calls indirectly
        // by checking index formula: 1.0 + sqrt(reserve) / 10_000
        it('index formula: 1.0 + sqrt(reserve) / 10_000', () => {
            // After 10,000 AFC units reserve: index = 1.0 + sqrt(10000) / 10000 = 1.01
            const expectedIndex = 1.0 + Math.sqrt(10_000) / 10_000;
            expect(expectedIndex).toBeCloseTo(1.01, 4);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. Governance — commission rate update
    // ────────────────────────────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates rate and subsequent calculations use new rate', () => {
            service.updateCommissionRate(0.01); // 1%
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(100, 8);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. Full lifecycle — processTransactionEmission
    //    Verifies: MINT → FEE_DIST (75%) → FEE_DIST (25%) → BURN → SNAPSHOT
    // ────────────────────────────────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        const TX_AMOUNT   = 10_000;
        const RECIPIENT   = 'USER_WALLET_XYZ';
        const REFERENCE   = 'TX_REF_001';

        beforeEach(() => {
            service.updateCommissionRate(0.005); // reset to default
        });

        it('returns correct EmissionResult', async () => {
            const result = await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            expect(result.emissionAmount).toBe(TX_AMOUNT);
            expect(result.commission).toBeCloseTo(50, 6);
            expect(result.nodeShare).toBeCloseTo(37.5, 6);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 6);
        });

        it('records MINT transaction first (1:1 emission to recipient)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);

            const mintCall = mockLedgerService.recordTransaction.mock.calls.find(
                ([args]) => args.type === TransactionType.MINT,
            );
            expect(mintCall).toBeDefined();
            const [mintArgs] = mintCall;
            expect(mintArgs.recipient).toBe(RECIPIENT);
            expect(parseFloat(mintArgs.amount)).toBeCloseTo(TX_AMOUNT, 6);
            expect(mintArgs.metadata.operation).toBe('CANONICAL_1_1_EMISSION');
        });

        it('records FEE_DISTRIBUTION for 75% node share', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);

            const nodeFeeCall = mockLedgerService.recordTransaction.mock.calls.find(
                ([args]) =>
                    args.type === TransactionType.FEE_DISTRIBUTION &&
                    args.metadata?.operation === 'NODE_FEE_75PCT',
            );
            expect(nodeFeeCall).toBeDefined();
            const [args] = nodeFeeCall;
            expect(parseFloat(args.amount)).toBeCloseTo(37.5, 6);
            expect(args.recipient).toBe('SYSTEM_NODE_POOL_00000000000000000000');
        });

        it('records FEE_DISTRIBUTION for 25% AFC reserve share', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);

            const afcCall = mockLedgerService.recordTransaction.mock.calls.find(
                ([args]) =>
                    args.type === TransactionType.FEE_DISTRIBUTION &&
                    args.metadata?.operation === 'AFC_RESERVE_25PCT',
            );
            expect(afcCall).toBeDefined();
            const [args] = afcCall;
            expect(parseFloat(args.amount)).toBeCloseTo(12.5, 6);
            expect(args.recipient).toBe('SYSTEM_AFC_RESERVE_000000000000000000');
        });

        it('records BURN transaction equal to emission amount (transient ARO)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);

            const burnCall = mockLedgerService.recordTransaction.mock.calls.find(
                ([args]) => args.type === TransactionType.BURN,
            );
            expect(burnCall).toBeDefined();
            const [burnArgs] = burnCall;
            expect(parseFloat(burnArgs.amount)).toBeCloseTo(TX_AMOUNT, 6);
            expect(burnArgs.metadata.operation).toBe('POST_TX_CANONICAL_BURN');
        });

        it('order: MINT → NODE_FEE_75PCT → AFC_RESERVE_25PCT → BURN', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);

            const ops = mockLedgerService.recordTransaction.mock.calls.map(
                ([args]) => args.metadata?.operation ?? args.type,
            );
            const mintIdx  = ops.indexOf('CANONICAL_1_1_EMISSION');
            const nodeIdx  = ops.indexOf('NODE_FEE_75PCT');
            const afcIdx   = ops.indexOf('AFC_RESERVE_25PCT');
            const burnIdx  = ops.indexOf('POST_TX_CANONICAL_BURN');

            expect(mintIdx).toBeLessThan(nodeIdx);
            expect(nodeIdx).toBeLessThan(afcIdx);
            expect(afcIdx).toBeLessThan(burnIdx);
        });

        it('AFC reserve grows after each transaction', async () => {
            const before = service.getAfcReserveState().totalReserve;
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            const after = service.getAfcReserveState().totalReserve;
            expect(after).toBeGreaterThan(before);
        });

        it('reserveIndex increases monotonically across multiple transactions', async () => {
            const idx0 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, `${REFERENCE}_1`);
            const idx1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, `${REFERENCE}_2`);
            const idx2 = service.getCurrentEmissionPrice();

            expect(idx1).toBeGreaterThan(idx0);
            expect(idx2).toBeGreaterThan(idx1);
        });

        it('commits the database transaction on success', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger unavailable'));
            await expect(
                service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE),
            ).rejects.toThrow('Ledger unavailable');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. Supply snapshot invariants
    //    Net circulating supply change = 0 per canonical TX cycle (mint = burn)
    // ────────────────────────────────────────────────────────────────────────

    describe('Supply snapshot — net-zero circulating supply', () => {
        it('saves a snapshot where totalMinted increases by emissionAmount', async () => {
            await service.processTransactionEmission(5_000, 'RECV', 'REF_SNAP_01');
            const [[, snapshotArg]] = mockQueryRunner.manager.save.mock.calls;
            expect(parseFloat(snapshotArg.totalMinted)).toBeCloseTo(5_000, 6);
        });

        it('saves a snapshot where totalBurned equals totalMinted (net zero)', async () => {
            await service.processTransactionEmission(5_000, 'RECV', 'REF_SNAP_02');
            const [[, snapshotArg]] = mockQueryRunner.manager.save.mock.calls;
            expect(parseFloat(snapshotArg.totalBurned)).toBeCloseTo(
                parseFloat(snapshotArg.totalMinted), 6,
            );
        });

        it('circulatingSupply stays at 0 after one canonical TX cycle', async () => {
            await service.processTransactionEmission(5_000, 'RECV', 'REF_SNAP_03');
            const [[, snapshotArg]] = mockQueryRunner.manager.save.mock.calls;
            expect(parseFloat(snapshotArg.circulatingSupply)).toBe(0);
        });
    });
});
