import { BadRequestException } from '@nestjs/common';
import { EmissionService } from './emission.service';
import { LedgerService } from '../ledger/ledger.service';
import { DataSource } from 'typeorm';
import { Repository } from 'typeorm';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { TransactionType } from '../ledger/entities/transaction.entity';

const mockLedgerService: Partial<LedgerService> = {
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

const mockDataSource: Partial<DataSource> = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

const mockSupplyRepo: Partial<Repository<SupplySnapshot>> = {
    find: jest.fn().mockResolvedValue([]),
};

function buildService(): EmissionService {
    return new EmissionService(
        mockSupplyRepo as Repository<SupplySnapshot>,
        mockLedgerService as LedgerService,
        mockDataSource as DataSource,
    );
}

describe('EmissionService — canonical 1:1 model', () => {
    let service: EmissionService;

    beforeEach(() => {
        service = buildService();
        jest.clearAllMocks();
        mockQueryRunner.manager.find.mockResolvedValue([]);
        mockQueryRunner.manager.save.mockResolvedValue({});
        (mockLedgerService.recordTransaction as jest.Mock).mockResolvedValue({ hash: 'TX_HASH' });
    });

    // -------------------------------------------------------------------------
    // calculate() — pure function
    // -------------------------------------------------------------------------

    describe('calculate()', () => {
        it('emits exactly 1:1 (emissionAmount === transactionAmount)', () => {
            const r = service.calculate(10_000);
            expect(r.emissionAmount).toBe(10_000);
        });

        it('applies default 0.5% commission', () => {
            const r = service.calculate(10_000);
            expect(r.commission).toBeCloseTo(50, 8);
        });

        it('splits commission 75% nodes / 25% AFC', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare).toBeCloseTo(37.5, 8);
            expect(r.afcReserveShare).toBeCloseTo(12.5, 8);
        });

        it('nodeShare + afcReserveShare === commission (no leakage)', () => {
            const r = service.calculate(10_000);
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 10);
        });

        it('honours custom commission rate', () => {
            const r = service.calculate(1_000, 0.01); // 1%
            expect(r.commission).toBeCloseTo(10, 8);
            expect(r.nodeShare).toBeCloseTo(7.5, 8);
            expect(r.afcReserveShare).toBeCloseTo(2.5, 8);
        });

        it('works for dust amounts (> 0)', () => {
            const r = service.calculate(0.00000001);
            expect(r.emissionAmount).toBe(0.00000001);
        });

        it('throws BadRequestException for zero amount', () => {
            expect(() => service.calculate(0)).toThrow(BadRequestException);
        });

        it('throws BadRequestException for negative amount', () => {
            expect(() => service.calculate(-100)).toThrow(BadRequestException);
        });
    });

    // -------------------------------------------------------------------------
    // AFC reserve index
    // -------------------------------------------------------------------------

    describe('AFC reserve index', () => {
        it('starts at 1.0 (no reserve accumulated)', () => {
            expect(service.getCurrentEmissionPrice()).toBe(1.0);
        });

        it('reserve index rises monotonically as AFC accumulates', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_1', 'REF_1');
            const after1 = service.getCurrentEmissionPrice();
            expect(after1).toBeGreaterThan(1.0);

            await service.processTransactionEmission(10_000, 'ADDR_2', 'REF_2');
            const after2 = service.getCurrentEmissionPrice();
            expect(after2).toBeGreaterThan(after1);
        });

        it('matches formula: 1.0 + sqrt(totalReserve) / 10_000', async () => {
            await service.processTransactionEmission(10_000, 'ADDR_1', 'REF_1');
            // AFC share = 10000 * 0.005 * 0.25 = 12.5
            const expectedIndex = 1.0 + Math.sqrt(12.5) / 10_000;
            expect(service.getCurrentEmissionPrice()).toBeCloseTo(expectedIndex, 10);
        });
    });

    // -------------------------------------------------------------------------
    // processTransactionEmission() — ledger calls
    // -------------------------------------------------------------------------

    describe('processTransactionEmission()', () => {
        it('records MINT, two FEE_DISTRIBUTION, and BURN in the correct order', async () => {
            const spy = mockLedgerService.recordTransaction as jest.Mock;

            await service.processTransactionEmission(500, 'RECIPIENT', 'REF_500');

            const calls: string[] = spy.mock.calls.map((c: any[]) => c[0].type);
            expect(calls[0]).toBe(TransactionType.MINT);
            expect(calls[1]).toBe(TransactionType.FEE_DISTRIBUTION); // node 75%
            expect(calls[2]).toBe(TransactionType.FEE_DISTRIBUTION); // AFC 25%
            expect(calls[3]).toBe(TransactionType.BURN);
        });

        it('mint amount equals transaction amount (1:1)', async () => {
            const spy = mockLedgerService.recordTransaction as jest.Mock;
            await service.processTransactionEmission(500, 'RECIPIENT', 'REF_500');

            const mintCall = spy.mock.calls.find((c: any[]) => c[0].type === TransactionType.MINT);
            expect(parseFloat(mintCall[0].amount)).toBeCloseTo(500, 8);
        });

        it('burn amount equals mint amount (net-zero supply)', async () => {
            const spy = mockLedgerService.recordTransaction as jest.Mock;
            await service.processTransactionEmission(500, 'RECIPIENT', 'REF_500');

            const mintCall = spy.mock.calls.find((c: any[]) => c[0].type === TransactionType.MINT);
            const burnCall = spy.mock.calls.find((c: any[]) => c[0].type === TransactionType.BURN);
            expect(mintCall[0].amount).toBe(burnCall[0].amount);
        });

        it('rolls back all ledger calls on error and re-throws', async () => {
            (mockLedgerService.recordTransaction as jest.Mock)
                .mockRejectedValueOnce(new Error('Ledger failure'));

            await expect(
                service.processTransactionEmission(100, 'ADDR', 'REF_ERR'),
            ).rejects.toThrow('Ledger failure');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        });

        it('throws BadRequestException for zero amount', async () => {
            await expect(
                service.processTransactionEmission(0, 'ADDR', 'REF_0'),
            ).rejects.toThrow(BadRequestException);
        });
    });

    // -------------------------------------------------------------------------
    // updateCommissionRate()
    // -------------------------------------------------------------------------

    describe('updateCommissionRate()', () => {
        it('changes the default rate used by calculate()', () => {
            service.updateCommissionRate(0.01);
            const r = service.calculate(1_000);
            expect(r.commission).toBeCloseTo(10, 8);
        });

        it('throws for rate <= 0', () => {
            expect(() => service.updateCommissionRate(0)).toThrow(BadRequestException);
        });

        it('throws for rate >= 1', () => {
            expect(() => service.updateCommissionRate(1)).toThrow(BadRequestException);
        });
    });
});
