import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockSupplyRepo = { find: jest.fn() };

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
                { provide: LedgerService,                       useValue: mockLedgerService },
                { provide: DataSource,                          useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue({});
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ── calculate() ──────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emits 1:1 — emissionAmount equals transactionAmount', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission', () => {
            const r = service.calculate(10_000);
            expect(r.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5,  8);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no leakage)', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
        });

        it('respects a custom commission rate', () => {
            const r = service.calculate(10_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(100,  8);
            expect(r.nodeShare).toBeCloseTo(75,    8);
            expect(r.afcReserveShare).toBeCloseTo(25, 8);
        });

        it('handles dust amounts correctly (1 unit)', () => {
            const r = service.calculate(1);
            expect(r.emissionAmount).toBe(1);
            expect(r.commission).toBeCloseTo(0.005, 10);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('returns commissionRate in result', () => {
            const r = service.calculate(5_000, 0.002);
            expect(r.commissionRate).toBe(0.002);
        });
    });

    // ── recordAfcContribution() / reserveIndex ────────────────────────────────

    describe('recordAfcContribution()', () => {
        it('increases reserveIndex monotonically', () => {
            const before = service.getCurrentEmissionPrice();
            service.recordAfcContribution(12.5);
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('follows sqrt formula: 1.0 + sqrt(total) / 10_000', () => {
            // Start from clean state (fresh service instance)
            service.recordAfcContribution(10_000);
            const expected = 1.0 + Math.sqrt(10_000) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 6);
        });

        it('does not decrease reserveIndex', () => {
            service.recordAfcContribution(100);
            const mid = service.getCurrentEmissionPrice();
            service.recordAfcContribution(0.001);
            expect(service.getCurrentEmissionPrice()).toBeGreaterThanOrEqual(mid);
        });
    });

    // ── processTransactionEmission() ──────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('executes all 4 ledger steps for a canonical transaction', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_A', 'REF_001');

            // MINT, FEE×2, BURN = 4 calls
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);

            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls[0][0].type).toBe('MINT');
            expect(calls[1][0].type).toBe('FEE_DISTRIBUTION'); // 75% nodes
            expect(calls[2][0].type).toBe('FEE_DISTRIBUTION'); // 25% AFC
            expect(calls[3][0].type).toBe('BURN');
        });

        it('minted amount equals transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT_B', 'REF_002');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBeCloseTo(5_000, 4);
        });

        it('burned amount equals emitted amount (net-zero supply)', async () => {
            await service.processTransactionEmission(5_000, 'RECIPIENT_B', 'REF_003');
            const calls = mockLedgerService.recordTransaction.mock.calls;
            const mintAmount = parseFloat(calls[0][0].amount);
            const burnAmount = parseFloat(calls[3][0].amount);
            expect(burnAmount).toBeCloseTo(mintAmount, 4);
        });

        it('rolls back and rethrows on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger down'));
            await expect(
                service.processTransactionEmission(1_000, 'RECIPIENT_C', 'REF_ERR'),
            ).rejects.toThrow('ledger down');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
