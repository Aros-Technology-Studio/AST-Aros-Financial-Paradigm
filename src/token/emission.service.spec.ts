import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { DataSource } from 'typeorm';

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

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
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
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('uses 1:1 emission — emissionAmount equals transactionAmount', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
        });

        it('canonical example: $10,000 at 0.5% commission', () => {
            const result = service.calculate(10_000, 0.005);
            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50, 8);
            expect(result.nodeShare).toBeCloseTo(37.5, 8);     // 75%
            expect(result.afcReserveShare).toBeCloseTo(12.5, 8); // 25%
            expect(result.commissionRate).toBe(0.005);
        });

        it('default commission rate is 0.5%', () => {
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(5, 8);
            expect(result.nodeShare).toBeCloseTo(3.75, 8);
            expect(result.afcReserveShare).toBeCloseTo(1.25, 8);
        });

        it('node share is 75% of commission', () => {
            const result = service.calculate(20_000, 0.01);
            expect(result.nodeShare).toBeCloseTo(result.commission * 0.75, 8);
        });

        it('AFC share is 25% of commission', () => {
            const result = service.calculate(20_000, 0.01);
            expect(result.afcReserveShare).toBeCloseTo(result.commission * 0.25, 8);
        });

        it('nodeShare + afcReserveShare = commission (no leakage)', () => {
            const result = service.calculate(50_000, 0.005);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('accepts a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01);
            expect(result.commission).toBeCloseTo(10, 8);
            expect(result.commissionRate).toBe(0.01);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // ── AFC Reserve price index ───────────────────────────────────────────────

    describe('AFC reserve price index', () => {
        it('starts at 1.0 (no reserve accumulated)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('initial reserve state is zero', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.reserveIndex).toBe(1.0);
            expect(state.transactionCount).toBe(0);
        });

        it('price index rises after processing a transaction (canonical sqrt formula)', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H1' });
            await service.processTransactionEmission(10_000, 'ADDR_A', 'REF_001');

            // afcShare = 10000 * 0.005 * 0.25 = 12.5
            // index = 1.0 + sqrt(12.5) / 10_000
            const expected = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 6);
        });

        it('reserve index grows monotonically across multiple transactions', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H' });
            await service.processTransactionEmission(5_000, 'A', 'R1');
            const idx1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(5_000, 'A', 'R2');
            const idx2 = service.getCurrentEmissionPrice();
            expect(idx2).toBeGreaterThan(idx1);
        });

        it('governance can update commission rate', () => {
            service.updateCommissionRate(0.01);
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 8);
        });

        it('throws when commission rate is out of range', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ── processTransactionEmission() ledger calls ─────────────────────────────

    describe('processTransactionEmission() — ledger call order', () => {
        const TX_AMOUNT    = 10_000;
        const RECIPIENT    = 'RECIPIENT_ADDR';
        const REFERENCE_ID = 'TX_REF_001';

        beforeEach(() => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'HASH' });
        });

        it('makes exactly 4 ledger calls per transaction', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first call is MINT 1:1 to recipient', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            const [mintCall] = mockLedgerService.recordTransaction.mock.calls;
            expect(mintCall[0].type).toBe(TransactionType.MINT);
            expect(mintCall[0].recipient).toBe(RECIPIENT);
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(TX_AMOUNT, 2);
            expect(mintCall[0].metadata.operation).toBe('CANONICAL_1_1_EMISSION');
        });

        it('second call distributes 75% commission to node pool', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            const [, nodeFeeCall] = mockLedgerService.recordTransaction.mock.calls;
            expect(nodeFeeCall[0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(nodeFeeCall[0].recipient).toContain('NODE_POOL');
            expect(parseFloat(nodeFeeCall[0].amount)).toBeCloseTo(37.5, 2);
            expect(nodeFeeCall[0].metadata.operation).toBe('NODE_FEE_75PCT');
        });

        it('third call distributes 25% commission to AFC reserve', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            const [, , afcCall] = mockLedgerService.recordTransaction.mock.calls;
            expect(afcCall[0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(afcCall[0].recipient).toContain('AFC_RESERVE');
            expect(parseFloat(afcCall[0].amount)).toBeCloseTo(12.5, 2);
            expect(afcCall[0].metadata.operation).toBe('AFC_RESERVE_25PCT');
        });

        it('fourth call burns the emitted ARO (transient token lifecycle)', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            const [, , , burnCall] = mockLedgerService.recordTransaction.mock.calls;
            expect(burnCall[0].type).toBe(TransactionType.BURN);
            expect(burnCall[0].recipient).toContain('BURN_VAULT');
            expect(parseFloat(burnCall[0].amount)).toBeCloseTo(TX_AMOUNT, 2);
            expect(burnCall[0].metadata.operation).toBe('POST_TX_CANONICAL_BURN');
        });

        it('commits the DB transaction on success', async () => {
            await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
            expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger down'));
            await expect(
                service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID),
            ).rejects.toThrow('Ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
        });
    });
});
