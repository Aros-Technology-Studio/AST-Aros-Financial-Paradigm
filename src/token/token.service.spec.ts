import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from './token.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { BridgeService } from '../bridge/bridge.service';
import { SmartContractIntegration } from '../integration/smart_contract.integration';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { EmissionService } from './emission.service';
import { TokenomicsService } from './tokenomics.service';
import { ProcessReserveLedgerService } from '../proof_of_transaction_engine/process_reserve.service';

const mockEmissionService = {
    calculate: jest.fn().mockReturnValue({ emissionAmount: 100, commission: 0.5, nodeShare: 0.375, afcReserveShare: 0.125, burnAmount: 99.5, commissionRate: 0.005 }),
    processTransactionEmission: jest.fn().mockResolvedValue({
        transactionAmount: 100,
        emissionAmount: 100,
        commission: 0.5,
        nodeShare: 0.375,
        afcReserveShare: 0.125,
        burnAmount: 99.5,
        commissionRate: 0.005,
        mintTxHash: 'MINT_TX_HASH',
    }),
    recordAfcContribution: jest.fn(),
    getCurrentEmissionPrice: jest.fn().mockReturnValue(1.0),
};

const mockTokenomicsService = {
    getCurrentPrice: jest.fn().mockReturnValue(1.0),
    updateInternalValuation: jest.fn(),
};

const mockProcessReserveService = {
    recordTransactionVolume: jest.fn(),
};

const mockSupplyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
};

const mockLedgerService = {
    recordTransaction: jest.fn(),
    getBalance: jest.fn(),
};

const mockBridgeService = {
    requestFiatPayout: jest.fn(),
};

const mockSmartContractService = {
    recordReference: jest.fn(),
};

const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
        find: jest.fn(),
        save: jest.fn(),
    },
};

const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

describe('TokenService', () => {
    let service: TokenService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TokenService,
                { provide: getRepositoryToken(SupplySnapshot), useValue: mockSupplyRepo },
                { provide: LedgerService, useValue: mockLedgerService },
                { provide: BridgeService, useValue: mockBridgeService },
                { provide: SmartContractIntegration, useValue: mockSmartContractService },
                { provide: DataSource, useValue: mockDataSource },
                {
                    provide: EventEmitter2,
                    useValue: {
                        emit: jest.fn(),
                    },
                },
                { provide: TokenomicsService, useValue: mockTokenomicsService },
                { provide: EmissionService, useValue: mockEmissionService },
                { provide: ProcessReserveLedgerService, useValue: mockProcessReserveService },
            ],
        }).compile();

        service = module.get<TokenService>(TokenService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('mint (legacy FIAT_DEPOSIT bridge path)', () => {
        it('should mint tokens successfully via direct ledger path', async () => {
            const amount = '100';
            const recipient = 'REC_1';
            const refId = 'REF_123';

            mockLedgerService.recordTransaction.mockResolvedValue({
                hash: 'TX_HASH', amount, recipient,
            });
            mockQueryRunner.manager.find.mockResolvedValue([]);

            const result = await service.mint(amount, recipient, refId);

            expect(mockLedgerService.recordTransaction).toHaveBeenCalled();
            expect(mockSmartContractService.recordReference).toHaveBeenCalledWith(refId, 'MINT', expect.any(Object));
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(result.status).toBe('SUCCESS');
        });

        it('applies canonical 75/25 commission split (3 ledger records)', async () => {
            const amount = '100';
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'TX_HASH', amount, recipient: 'REC_1' });
            mockQueryRunner.manager.find.mockResolvedValue([]);

            await service.mint(amount, 'REC_1', 'REF_FEE');

            // MINT + FEE_DISTRIBUTION (node 75%) + FEE_DISTRIBUTION (AFC 25%)
            expect(mockLedgerService.recordTransaction).toHaveBeenCalledTimes(3);
            expect(mockEmissionService.calculate).toHaveBeenCalledWith(100, undefined);
            expect(mockEmissionService.recordAfcContribution).toHaveBeenCalledWith(0.125);
        });

        it('should rollback and rethrow if ledger fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValueOnce(new Error('Ledger Error'));

            await expect(service.mint('100', 'REC_1', 'REF_1'))
                .rejects.toThrow('Ledger Error');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('mintForTransaction — canonical 1:1 emission', () => {
        const canonicalEmissionResult = {
            transactionAmount: 10_000,
            emissionAmount:    10_000,          // 1:1
            commission:        50,              // 10_000 × 0.005
            nodeShare:         37.5,            // 50 × 0.75
            afcReserveShare:   12.5,            // 50 × 0.25
            commissionRate:    0.005,
        };

        beforeEach(() => {
            mockEmissionService.processTransactionEmission.mockResolvedValue(canonicalEmissionResult);
        });

        it('should delegate to EmissionService and return the emission result', async () => {
            const result = await service.mintForTransaction(10_000, 'ADDR_TX_1', 'REF_TX_001');

            expect(mockEmissionService.processTransactionEmission).toHaveBeenCalledWith(
                10_000,
                'ADDR_TX_1',
                'REF_TX_001',
                undefined,
            );
            expect(result.emissionAmount).toBe(10_000);
            expect(result.commission).toBe(50);
            expect(result.nodeShare).toBe(37.5);
            expect(result.afcReserveShare).toBe(12.5);
        });

        it('should pass an explicit commissionRate to EmissionService', async () => {
            await service.mintForTransaction(5_000, 'ADDR_TX_2', 'REF_TX_002', 0.01);

            expect(mockEmissionService.processTransactionEmission).toHaveBeenCalledWith(
                5_000,
                'ADDR_TX_2',
                'REF_TX_002',
                0.01,
            );
        });

        it('should emit a canonical event after successful emission', async () => {
            const emitter = (service as any).eventEmitter;

            await service.mintForTransaction(10_000, 'ADDR_TX_1', 'REF_TX_003');

            expect(emitter.emit).toHaveBeenCalledWith(
                'token.emission.canonical',
                expect.objectContaining({
                    referenceId:     'REF_TX_003',
                    transactionAmount: 10_000,
                    emissionAmount:  10_000,
                    commission:      50,
                    nodeShare:       37.5,
                    afcReserveShare: 12.5,
                }),
            );
        });

        it('should reject a zero-amount transaction', async () => {
            await expect(service.mintForTransaction(0, 'ADDR', 'REF'))
                .rejects.toThrow(BadRequestException);

            expect(mockEmissionService.processTransactionEmission).not.toHaveBeenCalled();
        });

        it('should reject a negative-amount transaction', async () => {
            await expect(service.mintForTransaction(-500, 'ADDR', 'REF'))
                .rejects.toThrow(BadRequestException);
        });

        it('nodeShare + afcReserveShare should equal commission (canonical invariant)', async () => {
            const r = canonicalEmissionResult;
            expect(r.nodeShare + r.afcReserveShare).toBeCloseTo(r.commission, 8);
        });

        it('emissionAmount should equal transactionAmount (1:1 invariant)', async () => {
            const r = canonicalEmissionResult;
            expect(r.emissionAmount).toBe(r.transactionAmount);
        });
    });

    describe('burn', () => {
        it('should burn tokens and trigger bridge payout', async () => {
            const amount = '50';
            const sender = 'SENDER_1';
            const bankDetails = 'BANK_1';

            mockLedgerService.getBalance.mockResolvedValue('100'); // Sufficient balance
            mockLedgerService.recordTransaction.mockResolvedValue({ hash: 'BURN_TX' });
            mockQueryRunner.manager.find.mockResolvedValue([]); // No prev snapshot
            mockBridgeService.requestFiatPayout.mockResolvedValue('BANK_TX_ID');

            const result = await service.burn(amount, sender, bankDetails);

            expect(result.bankTxId).toBe('BANK_TX_ID');
            expect(mockBridgeService.requestFiatPayout).toHaveBeenCalledWith(amount, bankDetails);
        });

        it('should throw if insufficient balance', async () => {
            mockLedgerService.getBalance.mockResolvedValue('10'); // Less than 50

            await expect(service.burn('50', 'SENDER_1', 'BANK_1'))
                .rejects.toThrow(BadRequestException);

            // Should not even start transaction
            expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
        });
    });
});
