/**
 * EmissionService — Canonical 1:1 Emission Model Unit Tests
 *
 * Covers:
 *   - Pure calculation (calculate())
 *   - Full processTransactionEmission() lifecycle
 *   - AFC reserve state & price index
 *   - Guard conditions (bad input, commission rate validation)
 *   - Supply snapshot invariants (totalMinted == totalBurned, circulatingSupply unchanged)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockQueryRunner = {
  connect:             jest.fn(),
  startTransaction:    jest.fn(),
  commitTransaction:   jest.fn(),
  rollbackTransaction: jest.fn(),
  release:             jest.fn(),
  manager: {
    find: jest.fn().mockResolvedValue([]),   // No prior snapshot by default
    save: jest.fn().mockResolvedValue({}),
  },
};

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockLedgerService = {
  recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_TX_HASH' }),
};

const mockSupplyRepo = {
  find:    jest.fn(),
  findOne: jest.fn(),
  save:    jest.fn(),
};

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('EmissionService', () => {
  let service: EmissionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmissionService,
        { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
        { provide: LedgerService,                     useValue: mockLedgerService },
        { provide: DataSource,                        useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<EmissionService>(EmissionService);
    jest.clearAllMocks();

    // Reset snapshot mock to "no prior snapshot" by default
    mockQueryRunner.manager.find.mockResolvedValue([]);
  });

  // ─── Instantiation ────────────────────────────────────────────────────

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── calculate() — Pure Function ─────────────────────────────────────

  describe('calculate()', () => {
    it('returns emission equal to transaction amount (1:1)', () => {
      const result = service.calculate(10_000);
      expect(result.emissionAmount).toBe(10_000);
      expect(result.transactionAmount).toBe(10_000);
    });

    it('applies default 0.5% commission rate', () => {
      const result = service.calculate(10_000);
      expect(result.commissionRate).toBeCloseTo(0.005);
      expect(result.commission).toBeCloseTo(50);
    });

    it('splits commission 75% nodes / 25% AFC reserve', () => {
      const result = service.calculate(10_000);
      expect(result.nodeShare).toBeCloseTo(37.5);
      expect(result.afcReserveShare).toBeCloseTo(12.5);
    });

    it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
      const result = service.calculate(10_000);
      expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
    });

    it('accepts custom commission rate', () => {
      const result = service.calculate(1_000, 0.01); // 1%
      expect(result.commission).toBeCloseTo(10);
      expect(result.nodeShare).toBeCloseTo(7.5);
      expect(result.afcReserveShare).toBeCloseTo(2.5);
    });

    it('throws BadRequestException for zero amount', () => {
      expect(() => service.calculate(0)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for negative amount', () => {
      expect(() => service.calculate(-100)).toThrow(BadRequestException);
    });

    it('correctly handles very small (dust) amounts', () => {
      const result = service.calculate(0.00000001); // 1 satoshi-equivalent
      expect(result.emissionAmount).toBeCloseTo(0.00000001);
      expect(result.commission).toBeCloseTo(0.00000001 * 0.005);
    });

    it('correctly handles very large amounts', () => {
      const amount = 1_000_000_000;
      const result = service.calculate(amount);
      expect(result.emissionAmount).toBe(amount);
      expect(result.commission).toBeCloseTo(amount * 0.005);
    });
  });

  // ─── updateCommissionRate() ───────────────────────────────────────────

  describe('updateCommissionRate()', () => {
    it('updates commission rate and affects subsequent calculate()', () => {
      service.updateCommissionRate(0.01);
      const result = service.calculate(1_000);
      expect(result.commission).toBeCloseTo(10);
    });

    it('throws for commission rate >= 1 (100%)', () => {
      expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
    });

    it('throws for commission rate <= 0', () => {
      expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
      expect(() => service.updateCommissionRate(-0.01)).toThrow(BadRequestException);
    });
  });

  // ─── AFC Reserve ──────────────────────────────────────────────────────

  describe('AFC Reserve & Price Index', () => {
    it('starts with reserveIndex = 1.0 and totalReserve = 0', () => {
      const state = service.getAfcReserveState();
      expect(state.reserveIndex).toBe(1.0);
      expect(state.totalReserve).toBe(0);
    });

    it('getCurrentEmissionPrice() returns 1.0 on fresh instance', () => {
      expect(service.getCurrentEmissionPrice()).toBe(1.0);
    });

    it('reserveIndex grows after processTransactionEmission()', async () => {
      mockQueryRunner.manager.find.mockResolvedValue([]); // fresh snapshot
      mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_1' });

      await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

      const state = service.getAfcReserveState();
      // AFC share = 10_000 * 0.005 * 0.25 = 12.5
      // reserveIndex = 1.0 + sqrt(12.5) / 10_000 ≈ 1.0000353...
      expect(state.totalReserve).toBeCloseTo(12.5);
      expect(state.reserveIndex).toBeGreaterThan(1.0);
      expect(state.reserveIndex).toBeCloseTo(1.0 + Math.sqrt(12.5) / 10_000, 8);
    });

    it('reserveIndex is monotonically non-decreasing across multiple emissions', async () => {
      mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });
      mockQueryRunner.manager.find.mockResolvedValue([]);

      const indices: number[] = [];
      for (let i = 0; i < 5; i++) {
        await service.processTransactionEmission(5_000, 'ADDR', `REF_${i}`);
        indices.push(service.getCurrentEmissionPrice());
      }

      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
      }
    });

    it('reserveIndex formula: 1.0 + sqrt(100_000_000) / 10_000 ≈ 11.0', () => {
      // Simulate large reserve
      const bigReserve = 100_000_000;
      const expected   = 1.0 + Math.sqrt(bigReserve) / 10_000;
      expect(expected).toBeCloseTo(11.0, 1);
    });
  });

  // ─── processTransactionEmission() — Full Lifecycle ───────────────────

  describe('processTransactionEmission()', () => {
    const TX_AMOUNT    = 10_000;
    const RECIPIENT    = 'USER_WALLET_001';
    const REFERENCE_ID = 'TX_REF_999';

    beforeEach(() => {
      mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'LEDGER_TX' });
      mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    it('returns EmissionResult with correct values', async () => {
      const result = await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);

      expect(result.transactionAmount).toBe(TX_AMOUNT);
      expect(result.emissionAmount).toBe(TX_AMOUNT);              // 1:1
      expect(result.commission).toBeCloseTo(TX_AMOUNT * 0.005);
      expect(result.nodeShare).toBeCloseTo(result.commission * 0.75);
      expect(result.afcReserveShare).toBeCloseTo(result.commission * 0.25);
    });

    it('records exactly 4 ledger transactions (MINT, FEE×2, BURN)', async () => {
      await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
      expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
    });

    it('first ledger call is MINT to recipient (1:1)', async () => {
      await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
      const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
      expect(mintCall.type).toBe(TransactionType.MINT);
      expect(mintCall.recipient).toBe(RECIPIENT);
      expect(parseFloat(mintCall.amount)).toBeCloseTo(TX_AMOUNT);
    });

    it('second ledger call is FEE_DISTRIBUTION to node pool (75%)', async () => {
      await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
      const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
      expect(nodeCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
      expect(nodeCall.recipient).toContain('NODE_POOL');
      expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5);
    });

    it('third ledger call is FEE_DISTRIBUTION to AFC reserve (25%)', async () => {
      await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
      const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
      expect(afcCall.type).toBe(TransactionType.FEE_DISTRIBUTION);
      expect(afcCall.recipient).toContain('AFC_RESERVE');
      expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5);
    });

    it('fourth ledger call is BURN of emissionAmount (ARO are transient)', async () => {
      await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
      const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
      expect(burnCall.type).toBe(TransactionType.BURN);
      expect(burnCall.sender).toBe(RECIPIENT);
      expect(parseFloat(burnCall.amount)).toBeCloseTo(TX_AMOUNT);
    });

    it('commits the QueryRunner transaction on success', async () => {
      await service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back QueryRunner and rethrows on ledger failure', async () => {
      mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger error'));

      await expect(
        service.processTransactionEmission(TX_AMOUNT, RECIPIENT, REFERENCE_ID),
      ).rejects.toThrow('Ledger error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  // ─── Supply Snapshot Invariants ──────────────────────────────────────

  describe('Supply Snapshot Invariants', () => {
    const TX_AMOUNT = 10_000;

    beforeEach(() => {
      mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_H' });
    });

    it('totalMinted increases by emissionAmount after TX', async () => {
      mockQueryRunner.manager.find.mockResolvedValue([]); // no prior snapshot
      let savedSnapshot: any;
      mockQueryRunner.manager.save.mockImplementation((_entity: any, snap: any) => {
        savedSnapshot = snap;
        return Promise.resolve(snap);
      });

      await service.processTransactionEmission(TX_AMOUNT, 'REC', 'REF_SNAP_001');

      expect(parseFloat(savedSnapshot.totalMinted)).toBeCloseTo(TX_AMOUNT);
    });

    it('totalBurned equals totalMinted (net-zero supply per TX cycle)', async () => {
      mockQueryRunner.manager.find.mockResolvedValue([]);
      let savedSnapshot: any;
      mockQueryRunner.manager.save.mockImplementation((_entity: any, snap: any) => {
        savedSnapshot = snap;
        return Promise.resolve(snap);
      });

      await service.processTransactionEmission(TX_AMOUNT, 'REC', 'REF_SNAP_002');

      expect(savedSnapshot.totalMinted).toBe(savedSnapshot.totalBurned);
    });

    it('circulatingSupply is unchanged (mint cancels burn)', async () => {
      const priorSupply = '500000.00000000';
      mockQueryRunner.manager.find.mockResolvedValue([{
        circulatingSupply: priorSupply,
        totalMinted:       '500000.00000000',
        totalBurned:       '500000.00000000',
      }]);

      let savedSnapshot: any;
      mockQueryRunner.manager.save.mockImplementation((_entity: any, snap: any) => {
        savedSnapshot = snap;
        return Promise.resolve(snap);
      });

      await service.processTransactionEmission(TX_AMOUNT, 'REC', 'REF_SNAP_003');

      // circulatingSupply must remain the same as prior (net-zero)
      expect(parseFloat(savedSnapshot.circulatingSupply)).toBeCloseTo(parseFloat(priorSupply));
    });

    it('triggerTransactionHash is set to the referenceId', async () => {
      mockQueryRunner.manager.find.mockResolvedValue([]);
      let savedSnapshot: any;
      mockQueryRunner.manager.save.mockImplementation((_entity: any, snap: any) => {
        savedSnapshot = snap;
        return Promise.resolve(snap);
      });

      const REF = 'UNIQUE_REF_XYZ_777';
      await service.processTransactionEmission(TX_AMOUNT, 'REC', REF);
      expect(savedSnapshot.triggerTransactionHash).toBe(REF);
    });
  });

  // ─── Canonical Example from Spec ─────────────────────────────────────

  describe('Canonical example: $10,000 transaction', () => {
    it('matches specification exactly', () => {
      // Per coin_emission_model.md and aro_emission_protocol.md
      const result = service.calculate(10_000, 0.005);

      expect(result.emissionAmount).toBe(10_000);         // 1:1
      expect(result.commission).toBeCloseTo(50);           // 10_000 × 0.5%
      expect(result.nodeShare).toBeCloseTo(37.5);          // 50 × 75%
      expect(result.afcReserveShare).toBeCloseTo(12.5);    // 50 × 25%
    });

    it('AFC reserve index after first $10k TX matches spec formula', async () => {
      mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX' });
      mockQueryRunner.manager.find.mockResolvedValue([]);

      await service.processTransactionEmission(10_000, 'REC', 'REF_EXAMPLE');

      const state = service.getAfcReserveState();
      const expectedIndex = 1.0 + Math.sqrt(12.5) / 10_000;

      expect(state.reserveIndex).toBeCloseTo(expectedIndex, 8);
    });
  });
});
