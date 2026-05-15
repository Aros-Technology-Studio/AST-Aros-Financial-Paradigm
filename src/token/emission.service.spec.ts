import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
};

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
        save: jest.fn(),
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
                { provide: LedgerService, useValue: mockLedgerService },
                { provide: 'DataSource', useValue: mockDataSource },
            ],
        })
        .overrideProvider('DataSource')
        .useValue(mockDataSource)
        .compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
    });

    // ──────────────────────────────────────────────────────────────
    // calculate() — pure function, no side effects
    // ──────────────────────────────────────────────────────────────

    describe('calculate()', () => {
        it('canonical 1:1 example: $10,000 transaction', () => {
            const result = service.calculate(10_000);

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);           // 1:1
            expect(result.commissionRate).toBeCloseTo(0.005);
            expect(result.commission).toBeCloseTo(50);            // 10000 * 0.005
            expect(result.nodeShare).toBeCloseTo(37.5);           // 50 * 0.75
            expect(result.afcReserveShare).toBeCloseTo(12.5);     // 50 * 0.25
        });

        it('emission equals transaction amount for any positive input', () => {
            for (const amount of [1, 100, 999.99, 1_000_000]) {
                const r = service.calculate(amount);
                expect(r.emissionAmount).toBe(amount);
            }
        });

        it('nodeShare + afcReserveShare === commission (no rounding loss)', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission);
        });

        it('uses custom commission rate when provided', () => {
            const r = service.calculate(10_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(100);
            expect(r.nodeShare).toBeCloseTo(75);
            expect(r.afcReserveShare).toBeCloseTo(25);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-500)).toThrow(BadRequestException);
        });

        it('small dust amount still maintains 1:1 emission', () => {
            const r = service.calculate(0.000001);
            expect(r.emissionAmount).toBe(0.000001);
        });
    });

    // ──────────────────────────────────────────────────────────────
    // getAfcReserveState() & getCurrentEmissionPrice()
    // ──────────────────────────────────────────────────────────────

    describe('AFC reserve state', () => {
        it('starts with reserveIndex = 1.0 and zero reserve', () => {
            const state = service.getAfcReserveState();
            expect(state.reserveIndex).toBe(1.0);
            expect(state.totalReserve).toBe(0);
            expect(state.transactionCount).toBe(0);
        });

        it('getCurrentEmissionPrice() returns reserveIndex', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('getAfcReserveState returns a copy (immutable snapshot)', () => {
            const snap1 = service.getAfcReserveState();
            const snap2 = service.getAfcReserveState();
            expect(snap1).not.toBe(snap2); // different object references
        });
    });

    // ──────────────────────────────────────────────────────────────
    // updateCommissionRate()
    // ──────────────────────────────────────────────────────────────

    describe('updateCommissionRate()', () => {
        it('accepts a valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
            const r = service.calculate(1000);
            expect(r.commission).toBeCloseTo(10);
        });

        it('throws on rate = 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws on rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
            expect(() => service.updateCommissionRate(1.5)).toThrow(BadRequestException);
        });
    });

    // ──────────────────────────────────────────────────────────────
    // processTransactionEmission() — canonical lifecycle
    // ──────────────────────────────────────────────────────────────

    describe('processTransactionEmission()', () => {
        const setup = () => {
            mockQueryRunner.manager.find.mockResolvedValue([]);
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
        };

        it('records four ledger operations in canonical order', async () => {
            setup();
            const calls: TransactionType[] = [];
            mockLedgerService.recordTransaction.mockImplementation(async (dto: any) => {
                calls.push(dto.type);
                return { hash: 'TX_HASH' };
            });

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_001');

            expect(calls[0]).toBe(TransactionType.MINT);
            expect(calls[1]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2]).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3]).toBe(TransactionType.BURN);
        });

        it('MINT amount equals transaction amount (1:1)', async () => {
            setup();
            const mintCalls: any[] = [];
            mockLedgerService.recordTransaction.mockImplementation(async (dto: any) => {
                if (dto.type === TransactionType.MINT) mintCalls.push(dto);
                return { hash: 'TX_HASH' };
            });

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_002');

            expect(mintCalls).toHaveLength(1);
            expect(parseFloat(mintCalls[0].amount)).toBeCloseTo(10_000);
            expect(mintCalls[0].recipient).toBe('RECIPIENT_1');
        });

        it('BURN amount equals emitted amount (ARO destroyed after TX)', async () => {
            setup();
            const burnCalls: any[] = [];
            mockLedgerService.recordTransaction.mockImplementation(async (dto: any) => {
                if (dto.type === TransactionType.BURN) burnCalls.push(dto);
                return { hash: 'TX_HASH' };
            });

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_003');

            expect(burnCalls).toHaveLength(1);
            expect(parseFloat(burnCalls[0].amount)).toBeCloseTo(10_000);
        });

        it('fee split: 75% to node pool, 25% to AFC reserve', async () => {
            setup();
            const feeCalls: any[] = [];
            mockLedgerService.recordTransaction.mockImplementation(async (dto: any) => {
                if (dto.type === TransactionType.FEE_DISTRIBUTION) feeCalls.push(dto);
                return { hash: 'TX_HASH' };
            });

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_004');

            expect(feeCalls).toHaveLength(2);
            const nodeCall = feeCalls.find((c: any) => c.metadata.operation === 'NODE_FEE_75PCT');
            const afcCall  = feeCalls.find((c: any) => c.metadata.operation === 'AFC_RESERVE_25PCT');

            expect(nodeCall).toBeDefined();
            expect(afcCall).toBeDefined();
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5);   // 50 * 0.75
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5);    // 50 * 0.25
        });

        it('AFC reserve index rises after each transaction', async () => {
            setup();
            const priceBefore = service.getCurrentEmissionPrice();

            await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_005');

            const priceAfter = service.getCurrentEmissionPrice();
            expect(priceAfter).toBeGreaterThan(priceBefore);
        });

        it('returns EmissionResult with correct values', async () => {
            setup();
            const result = await service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_006');

            expect(result.transactionAmount).toBe(10_000);
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBeCloseTo(50);
            expect(result.nodeShare).toBeCloseTo(37.5);
            expect(result.afcReserveShare).toBeCloseTo(12.5);
        });

        it('rolls back and rethrows if ledger fails', async () => {
            mockQueryRunner.manager.find.mockResolvedValue([]);
            mockLedgerService.recordTransaction.mockRejectedValue(new Error('Ledger unavailable'));

            await expect(
                service.processTransactionEmission(10_000, 'RECIPIENT_1', 'REF_FAIL'),
            ).rejects.toThrow('Ledger unavailable');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });

        it('throws BadRequestException for zero amount', async () => {
            await expect(
                service.processTransactionEmission(0, 'RECIPIENT_1', 'REF_ZERO'),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
