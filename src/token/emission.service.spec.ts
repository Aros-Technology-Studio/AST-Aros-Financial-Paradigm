import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockLedgerService = { recordTransaction: jest.fn().mockResolvedValue({ hash: 'TX' }) };

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
};

const mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };

describe('EmissionService — canonical 1:1 model', () => {
    let service: EmissionService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmissionService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: { find: jest.fn(), save: jest.fn() } },
                { provide: LedgerService, useValue: mockLedgerService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    // ── calculate() ────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('emission equals transaction amount (1:1)', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
        });

        it('commission = txAmount × 0.5% default', () => {
            const r = service.calculate(10_000);
            expect(r.commission).toBeCloseTo(50, 8);
        });

        it('nodeShare = commission × 75%', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 8);
        });

        it('afcReserveShare = commission × 25%', () => {
            const r = service.calculate(10_000);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare == commission (no rounding loss)', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 8);
        });

        it('custom commission rate is respected', () => {
            const r = service.calculate(1_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(10, 8);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('dust amount still satisfies 1:1', () => {
            const r = service.calculate(0.000001);
            expect(r.emissionAmount).toBe(0.000001);
        });
    });

    // ── AFC reserve index ───────────────────────────────────────────────────

    describe('updateAfcReserve() + price index', () => {
        it('reserveIndex starts at 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserveIndex rises monotonically after each deposit', () => {
            service.updateAfcReserve(12.5);
            const idx1 = service.getCurrentEmissionPrice();
            service.updateAfcReserve(12.5);
            const idx2 = service.getCurrentEmissionPrice();
            expect(idx1).toBeGreaterThan(1.0);
            expect(idx2).toBeGreaterThan(idx1);
        });

        it('$10k tx → AFC gets 12.5 ARO → correct index', () => {
            service.updateAfcReserve(12.5);
            // reserveIndex = 1.0 + sqrt(12.5) / 10_000
            const expected = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expected, 8);
        });

        it('getAfcReserveState() returns a snapshot (not the live reference)', () => {
            service.updateAfcReserve(100);
            const snap = service.getAfcReserveState();
            service.updateAfcReserve(100);
            expect(snap.totalReserve).toBe(100); // snapshot frozen at capture time
        });
    });

    // ── processTransactionEmission() — full lifecycle ────────────────────

    describe('processTransactionEmission()', () => {
        it('records 4 ledger entries per canonical lifecycle', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H' });

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            // MINT + FEE_DISTRIBUTION(nodes) + FEE_DISTRIBUTION(AFC) + BURN = 4 calls
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('MINT call carries emissionAmount equal to txAmount', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H' });

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_002');

            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(mintCall.type).toBe('MINT');
            expect(parseFloat(mintCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('BURN call carries emissionAmount equal to txAmount (ARO are transient)', async () => {
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'H' });

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_003');

            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(burnCall.type).toBe('BURN');
            expect(parseFloat(burnCall.amount)).toBeCloseTo(10_000, 6);
        });

        it('rolls back on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValue(new Error('Ledger down'));

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_ERR'),
            ).rejects.toThrow('Ledger down');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
