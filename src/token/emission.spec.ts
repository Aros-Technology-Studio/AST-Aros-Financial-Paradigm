import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
};

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockQueryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
        find: jest.fn().mockResolvedValue([]),   // no previous snapshot by default
        save: jest.fn().mockResolvedValue({}),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

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

        // Reset mocks to defaults after clear
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue({});
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_TX_HASH' });
    });

    // -------------------------------------------------------------------------
    // Section 1: Pure calculation — EmissionService.calculate()
    // -------------------------------------------------------------------------

    describe('calculate() — pure 1:1 emission math', () => {
        it('emissionAmount equals transactionAmount exactly (1:1 rule)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('default commission rate is 0.5%', () => {
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.005);
            expect(result.commission).toBeCloseTo(50, 8);
        });

        it('nodeShare is 75% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare is 25% of commission', () => {
            const result = service.calculate(10_000);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.nodeShare).toBeCloseTo(7.5, 8);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('handles dust amounts without loss of precision', () => {
            const result = service.calculate(0.01);
            expect(result.emissionAmount).toBe(0.01);
            expect(result.commission).toBeCloseTo(0.00005, 10);
            expect(result.nodeShare).toBeCloseTo(0.0000375, 10);
            expect(result.afcReserveShare).toBeCloseTo(0.0000125, 10);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('emissionAmount is always equal to transactionAmount regardless of rate', () => {
            [0.001, 0.005, 0.01, 0.1].forEach(rate => {
                const result = service.calculate(5_000, rate);
                expect(result.emissionAmount).toBe(5_000);
            });
        });
    });

    // -------------------------------------------------------------------------
    // Section 2: AFC Reserve — monotonic growth and index formula
    // -------------------------------------------------------------------------

    describe('AFC Reserve — index growth and state', () => {
        it('initial reserve state has index = 1.0 and totalReserve = 0', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.reserveIndex).toBe(1.0);
            expect(state.transactionCount).toBe(0);
        });

        it('reserve index is 1.0 + sqrt(totalReserve) / 10_000', async () => {
            // Process a TX that adds exactly 12.5 to AFC reserve (10_000 TX, 0.5% fee, 25%)
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-001');

            const state = service.getAfcReserveState();
            const expectedIndex = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expectedIndex, 8);
        });

        it('reserve index is monotonically non-decreasing across multiple transactions', async () => {
            const indices: number[] = [];

            for (let i = 1; i <= 5; i++) {
                await service.processTransactionEmission(1_000 * i, 'RECIPIENT', `REF-${i}`);
                indices.push(service.getAfcReserveState().reserveIndex);
            }

            for (let i = 1; i < indices.length; i++) {
                expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
            }
        });

        it('transactionCount increments with each processed emission', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF-COUNT-1');
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF-COUNT-2');

            expect(service.getAfcReserveState().transactionCount).toBe(2);
        });

        it('getCurrentEmissionPrice() returns the current reserveIndex', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-PRICE-1');
            const price = service.getCurrentEmissionPrice();
            const state = service.getAfcReserveState();
            expect(price).toBe(state.reserveIndex);
        });

        it('getAfcReserveState() returns an immutable snapshot (not a live reference)', async () => {
            const snapshot1 = service.getAfcReserveState();
            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF-SNAP-1');
            const snapshot2 = service.getAfcReserveState();

            // snapshot1 should not have changed
            expect(snapshot1.totalReserve).toBe(0);
            expect(snapshot2.totalReserve).toBeGreaterThan(0);
        });
    });

    // -------------------------------------------------------------------------
    // Section 3: processTransactionEmission() — ledger call verification
    // -------------------------------------------------------------------------

    describe('processTransactionEmission() — canonical lifecycle', () => {
        it('executes exactly 4 ledger operations in the correct order', async () => {
            const calls: string[] = [];
            mockLedgerService.recordTransaction.mockImplementation((args) => {
                calls.push(args.type);
                return Promise.resolve({ hash: 'TX_HASH' });
            });

            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF-LIFECYCLE');

            expect(calls).toEqual([
                TransactionType.MINT,
                TransactionType.FEE_DISTRIBUTION, // 75% → node pool
                TransactionType.FEE_DISTRIBUTION, // 25% → AFC reserve
                TransactionType.BURN,
            ]);
        });

        it('Step 1: MINT sends emissionAmount (= txAmount) to recipient', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_RECIPIENT', 'REF-MINT');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(mintCall.type).toBe(TransactionType.MINT);
            expect(mintCall.recipient).toBe('ADDR_RECIPIENT');
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('Step 2a: FEE_DISTRIBUTION sends 75% of fee to NODE_POOL', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-NODE');

            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(nodeCall.recipient).toContain('NODE_POOL');
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 4);
        });

        it('Step 2b: FEE_DISTRIBUTION sends 25% of fee to AFC_RESERVE', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-AFC');

            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(afcCall.recipient).toContain('AFC_RESERVE');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 4);
        });

        it('Step 4: BURN destroys exactly emissionAmount (= txAmount)', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-BURN');

            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(burnCall.type).toBe(TransactionType.BURN);
            expect(burnCall.recipient).toContain('BURN');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 4);
        });

        it('mint amount equals burn amount (net circulating supply = 0)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF-NET-ZERO');

            const mintAmount  = parseFloat(mockLedgerService.recordTransaction.mock.calls[0][0].amount);
            const burnAmount  = parseFloat(mockLedgerService.recordTransaction.mock.calls[3][0].amount);
            expect(mintAmount).toBeCloseTo(burnAmount, 8);
        });

        it('returns an EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-RESULT');

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 4);
            expect(result.nodeShare).toBeCloseTo(37.5, 4);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 4);
        });

        it('uses QueryRunner and commits on success', async () => {
            await service.processTransactionEmission(1_000, 'RECIPIENT', 'REF-QR');

            expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
            expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
        });

        it('rolls back on ledger failure and rethrows', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT', 'REF-ROLLBACK'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
            expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
        });

        it('always releases QueryRunner even on error', async () => {
            mockLedgerService.recordTransaction.mockRejectedValue(new Error('Fatal'));

            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT', 'REF-RELEASE'),
            ).rejects.toThrow();

            expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
        });
    });

    // -------------------------------------------------------------------------
    // Section 4: SupplySnapshot invariant
    // -------------------------------------------------------------------------

    describe('SupplySnapshot — audit trail', () => {
        it('totalMinted increases by emissionAmount', async () => {
            mockQueryRunner.manager.find.mockResolvedValue([]); // no prev snapshot

            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-SNAP');

            const savedSnapshot = mockQueryRunner.manager.save.mock.calls[0][1];
            expect(parseFloat(savedSnapshot.totalMinted)).toBeCloseTo(10_000, 4);
        });

        it('totalBurned increases by emissionAmount', async () => {
            mockQueryRunner.manager.find.mockResolvedValue([]);

            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-SNAP-B');

            const savedSnapshot = mockQueryRunner.manager.save.mock.calls[0][1];
            expect(parseFloat(savedSnapshot.totalBurned)).toBeCloseTo(10_000, 4);
        });

        it('circulatingSupply remains unchanged (net zero per TX cycle)', async () => {
            const prevCirculating = 500_000;
            mockQueryRunner.manager.find.mockResolvedValue([{
                totalMinted: '500000',
                totalBurned: '0',
                circulatingSupply: prevCirculating.toString(),
            }]);

            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF-CIRC');

            const savedSnapshot = mockQueryRunner.manager.save.mock.calls[0][1];
            // circulating supply should stay at prevCirculating (mint + burn cancel out)
            expect(parseFloat(savedSnapshot.circulatingSupply)).toBeCloseTo(prevCirculating, 4);
        });

        it('totalMinted accumulates across multiple transactions', async () => {
            // First TX: start from zero
            mockQueryRunner.manager.find.mockResolvedValueOnce([]);
            await service.processTransactionEmission(5_000, 'RECIPIENT', 'REF-ACC-1');

            const firstSave = mockQueryRunner.manager.save.mock.calls[0][1];
            expect(parseFloat(firstSave.totalMinted)).toBeCloseTo(5_000, 4);

            // Second TX: build on first snapshot
            mockQueryRunner.manager.find.mockResolvedValueOnce([{
                totalMinted: firstSave.totalMinted,
                totalBurned: firstSave.totalBurned,
                circulatingSupply: firstSave.circulatingSupply,
            }]);
            await service.processTransactionEmission(3_000, 'RECIPIENT', 'REF-ACC-2');

            const secondSave = mockQueryRunner.manager.save.mock.calls[1][1];
            expect(parseFloat(secondSave.totalMinted)).toBeCloseTo(8_000, 4);
        });
    });

    // -------------------------------------------------------------------------
    // Section 5: Governance — commission rate update
    // -------------------------------------------------------------------------

    describe('updateCommissionRate() — governance control', () => {
        it('updates the commission rate used in subsequent calculations', () => {
            service.updateCommissionRate(0.01); // 1%
            const result = service.calculate(10_000);
            expect(result.commissionRate).toBe(0.01);
            expect(result.commission).toBeCloseTo(100, 4);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(-0.01)).toThrow(BadRequestException);
        });

        it('throws for rate >= 1 (100% fee is nonsensical)', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });

        it('accepts any valid fractional rate', () => {
            expect(() => service.updateCommissionRate(0.001)).not.toThrow();
            expect(() => service.updateCommissionRate(0.5)).not.toThrow();
            expect(() => service.updateCommissionRate(0.999)).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // Section 6: Worked example — $10,000 transaction full verification
    // -------------------------------------------------------------------------

    describe('Worked Example — $10,000 transaction', () => {
        it('satisfies all canonical rules simultaneously', () => {
            const TX_AMOUNT = 10_000;
            const result = service.calculate(TX_AMOUNT);

            // 1:1 emission
            expect(result.emissionAmount).toBe(TX_AMOUNT);

            // 0.5% commission
            expect(result.commission).toBeCloseTo(50, 8);

            // 75% to nodes
            expect(result.nodeShare).toBeCloseTo(37.5, 8);

            // 25% to AFC
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8);

            // Splits sum to total commission
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(50, 8);

            // AFC index after this reserve addition
            const expectedIndex = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(expectedIndex).toBeCloseTo(1.0000353, 6);
        });
    });
});
