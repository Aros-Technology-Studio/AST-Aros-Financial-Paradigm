import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<EmissionService>(EmissionService);
        jest.clearAllMocks();
        mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH' });
        mockQueryRunner.manager.find.mockResolvedValue([]);
    });

    describe('calculate() — canonical 1:1 model', () => {
        it('emits 1:1 with transaction amount', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
            expect(r.transactionAmount).toBe(10_000);
        });

        it('calculates default 0.5% commission', () => {
            const r = service.calculate(10_000);
            expect(r.commission).toBeCloseTo(50, 8);
        });

        it('splits commission: 75% nodes + 25% AFC', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 8);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission exactly', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
        });

        it('accepts custom commission rate', () => {
            const r = service.calculate(1_000, 0.01);
            expect(r.commission).toBeCloseTo(10, 8);
            expect(r.nodeShare).toBeCloseTo(7.5, 8);
            expect(r.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('throws on zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws on negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });

        it('handles dust amounts correctly', () => {
            const r = service.calculate(0.000001);
            expect(r.emissionAmount).toBe(0.000001);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 12);
        });
    });

    describe('AFC reserve price index', () => {
        it('starts at reserveIndex 1.0', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('getCurrentEmissionPrice returns reserveIndex from state', () => {
            const price = service.getCurrentEmissionPrice();
            expect(typeof price).toBe('number');
            expect(price).toBeGreaterThanOrEqual(1.0);
        });

        it('getAfcReserveState returns a snapshot', () => {
            const state = service.getAfcReserveState();
            expect(state).toHaveProperty('totalReserve');
            expect(state).toHaveProperty('reserveIndex');
            expect(state).toHaveProperty('transactionCount');
        });
    });

    describe('updateCommissionRate()', () => {
        it('rejects rate of 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('rejects rate of 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });

        it('accepts valid rate', () => {
            expect(() => service.updateCommissionRate(0.01)).not.toThrow();
            expect(service.calculate(1000).commission).toBeCloseTo(10, 8);
        });
    });

    describe('processTransactionEmission() — full lifecycle', () => {
        it('records four ledger entries: MINT, FEE×2, BURN', async () => {
            await service.processTransactionEmission(1000, 'RECIPIENT', 'REF_001');
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(4);
            const calls = mockLedgerService.recordTransaction.mock.calls;
            expect(calls[0][0].type).toBe(TransactionType.MINT);
            expect(calls[1][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[2][0].type).toBe(TransactionType.FEE_DISTRIBUTION);
            expect(calls[3][0].type).toBe(TransactionType.BURN);
        });

        it('mints exactly transactionAmount (1:1)', async () => {
            await service.processTransactionEmission(5000, 'RECIPIENT', 'REF_002');
            const mintCall = mockLedgerService.recordTransaction.mock.calls[0][0];
            expect(parseFloat(mintCall.amount)).toBe(5000);
        });

        it('burns exactly emissionAmount', async () => {
            await service.processTransactionEmission(5000, 'RECIPIENT', 'REF_003');
            const burnCall = mockLedgerService.recordTransaction.mock.calls[3][0];
            expect(parseFloat(burnCall.amount)).toBe(5000);
        });

        it('routes AFC share to AFC reserve address', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_004');
            const afcCall = mockLedgerService.recordTransaction.mock.calls[2][0];
            expect(afcCall.recipient).toBe('SYSTEM_AFC_RESERVE_000000000000000000');
            expect(parseFloat(afcCall.amount)).toBeCloseTo(12.5, 6);
        });

        it('routes node share to node pool address', async () => {
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_005');
            const nodeCall = mockLedgerService.recordTransaction.mock.calls[1][0];
            expect(nodeCall.recipient).toBe('SYSTEM_NODE_POOL_00000000000000000000');
            expect(parseFloat(nodeCall.amount)).toBeCloseTo(37.5, 6);
        });

        it('increases AFC reserveIndex after emission', async () => {
            const before = service.getCurrentEmissionPrice();
            await service.processTransactionEmission(10_000, 'RECIPIENT', 'REF_006');
            const after = service.getCurrentEmissionPrice();
            expect(after).toBeGreaterThan(before);
        });

        it('rolls back on ledger failure', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger fail'));
            await expect(
                service.processTransactionEmission(1000, 'RECIPIENT', 'REF_ERR'),
            ).rejects.toThrow('Ledger fail');
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
