import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';

const mockLedgerService = {
    recordTransaction: jest.fn().mockResolvedValue({ hash: 'MOCK_HASH' }),
};

const mockSupplyRepo = {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
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
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'MOCK_HASH' });
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculate() ────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('returns emission equal to tx amount (1:1)', () => {
            const result = service.calculate(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.transactionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission', () => {
            const result = service.calculate(10_000);
            expect(result.commission).toBeCloseTo(50, 6);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare).toBeCloseTo(37.5, 6);
            expect(result.afcReserveShare).toBeCloseTo(12.5, 6);
        });

        it('node + AFC shares sum to commission (no rounding loss)', () => {
            const result = service.calculate(10_000);
            expect(result.nodeShare + result.afcReserveShare).toBeCloseTo(result.commission, 8);
        });

        it('honours a custom commission rate', () => {
            const result = service.calculate(1_000, 0.01); // 1%
            expect(result.commission).toBeCloseTo(10, 6);
            expect(result.nodeShare).toBeCloseTo(7.5, 6);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 6);
        });

        it('throws BadRequestException on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException on negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts without error', () => {
            const result = service.calculate(0.00000001);
            expect(result.emissionAmount).toBeCloseTo(0.00000001, 12);
        });
    });

    // ─── AFC reserve & emission price ───────────────────────────────────────────

    describe('AFC reserve & emission price', () => {
        it('starts with reserveIndex = 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('getAfcReserveState() returns correct initial state', () => {
            const state = service.getAfcReserveState();
            expect(state.totalReserve).toBe(0);
            expect(state.reserveIndex).toBe(1.0);
            expect(state.transactionCount).toBe(0);
        });

        it('reserveIndex rises after processTransactionEmission', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_X', 'REF_001');
            const price = service.getCurrentEmissionPrice();
            // AFC share = 12.5 → index = 1.0 + sqrt(12.5)/10_000 ≈ 1.0000353
            expect(price).toBeGreaterThan(1.0);
        });

        it('reserveIndex formula: 1.0 + sqrt(totalAfcReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT_Y', 'REF_002');
            const state    = service.getAfcReserveState();
            const expected = 1.0 + Math.sqrt(state.totalReserve) / 10_000;
            expect(state.reserveIndex).toBeCloseTo(expected, 8);
        });

        it('reserveIndex is monotonically non-decreasing', async () => {
            await service.processTransactionEmission(5_000, 'ADDR_A', 'REF_A1');
            const p1 = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(5_000, 'ADDR_A', 'REF_A2');
            const p2 = service.getCurrentEmissionPrice();
            expect(p2).toBeGreaterThanOrEqual(p1);
        });
    });

    // ─── processTransactionEmission() lifecycle ─────────────────────────────────

    describe('processTransactionEmission()', () => {
        it('records exactly 4 ledger transactions', async () => {
            await service.processTransactionEmission(1_000, 'REC_1', 'TX_001');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
        });

        it('first call is MINT with 1:1 emission amount', async () => {
            await service.processTransactionEmission(1_000, 'REC_1', 'TX_002');
            const [mintCall] = mockLedgerService.recordTransaction.mock.calls;
            expect(mintCall[0].type).toBe('MINT');
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(1_000, 6);
        });

        it('last call is BURN with the same amount', async () => {
            await service.processTransactionEmission(1_000, 'REC_1', 'TX_003');
            const calls = mockLedgerService.recordTransaction.mock.calls;
            const burnCall = calls[calls.length - 1];
            expect(burnCall[0].type).toBe('BURN');
            expect(parseFloat(burnCall[0].amount)).toBeCloseTo(1_000, 6);
        });

        it('rolls back and rethrows if ledger fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('ledger fail'));
            await expect(
                service.processTransactionEmission(500, 'REC_FAIL', 'TX_FAIL'),
            ).rejects.toThrow('ledger fail');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('returns EmissionResult with correct values', async () => {
            const result = await service.processTransactionEmission(2_000, 'REC_2', 'TX_004');
            expect(result.emissionAmount).toBe(2_000);
            expect(result.commission).toBeCloseTo(10, 6);
            expect(result.nodeShare).toBeCloseTo(7.5, 6);
            expect(result.afcReserveShare).toBeCloseTo(2.5, 6);
        });
    });

    // ─── updateCommissionRate() ─────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('updates the commission rate used by calculate()', () => {
            service.updateCommissionRate(0.01); // 1%
            const result = service.calculate(1_000);
            expect(result.commission).toBeCloseTo(10, 6);
        });

        it('throws on rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });
});
