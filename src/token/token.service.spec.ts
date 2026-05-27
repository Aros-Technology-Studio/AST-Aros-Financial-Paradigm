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
import { TokenomicsService } from './tokenomics.service';
import { EmissionService } from './emission.service';
import { ProcessReserveLedgerService } from '../proof_of_transaction_engine/process_reserve.service';

// Dynamic mock: implements canonical 1:1 formula so tests can assert real math values.
const mockEmissionService = {
    calculate: jest.fn().mockImplementation((txAmount: number, rate = 0.005) => {
        const commission = txAmount * rate;
        return {
            transactionAmount: txAmount,
            emissionAmount:    txAmount,          // 1:1
            commission,
            nodeShare:         commission * 0.75,
            afcReserveShare:   commission * 0.25,
            commissionRate:    rate,
        };
    }),
    processTransactionEmission: jest.fn().mockImplementation(
        async (txAmount: number, _recipient: string, _refId: string, rate = 0.005) => {
            const commission = txAmount * rate;
            return {
                transactionAmount: txAmount,
                emissionAmount:    txAmount,      // 1:1
                commission,
                nodeShare:         commission * 0.75,
                afcReserveShare:   commission * 0.25,
                commissionRate:    rate,
            };
        },
    ),
    getCurrentEmissionPrice: jest.fn().mockReturnValue(1.0),
    getAfcReserveState: jest.fn().mockReturnValue({
        totalReserve: 0, reserveIndex: 1.0, transactionCount: 0, lastUpdated: 0,
    }),
    updateAfcReserve: jest.fn().mockResolvedValue(undefined),
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

    describe('mintForTransaction (canonical 1:1 emission)', () => {
        it('should delegate to EmissionService and emit event', async () => {
            const txAmount   = 10_000;
            const recipient  = 'RECIPIENT_01';
            const referenceId = 'REF_CANONICAL_001';

            const result = await service.mintForTransaction(txAmount, recipient, referenceId);

            // Canonical emission was executed
            expect(mockEmissionService.processTransactionEmission).toHaveBeenCalledWith(
                txAmount, recipient, referenceId, undefined,
            );

            // Returned values match 1:1 model
            expect(result.emissionAmount).toBe(txAmount);
            expect(result.commission).toBeCloseTo(txAmount * 0.005, 5);
            expect(result.nodeShare).toBeCloseTo(result.commission * 0.75, 5);
            expect(result.afcReserveShare).toBeCloseTo(result.commission * 0.25, 5);
        });

        it('should reject non-positive transaction amount', async () => {
            await expect(service.mintForTransaction(0, 'REC', 'REF'))
                .rejects.toThrow(BadRequestException);
            await expect(service.mintForTransaction(-1, 'REC', 'REF'))
                .rejects.toThrow(BadRequestException);
        });

        it('should forward custom commissionRate to EmissionService', async () => {
            await service.mintForTransaction(5_000, 'REC_2', 'REF_002', 0.01);

            expect(mockEmissionService.processTransactionEmission).toHaveBeenCalledWith(
                5_000, 'REC_2', 'REF_002', 0.01,
            );
        });
    });

    describe('mint', () => {
        it('should mint tokens successfully', async () => {
            const amount = '100';
            const recipient = 'REC_1';
            const refId = 'REF_123';

            mockLedgerService.recordTransaction.mockResolvedValue({
                hash: 'TX_HASH',
                amount: amount,
                recipient: recipient
            });
            mockQueryRunner.manager.find.mockResolvedValue([]); // No previous snapshot

            const result = await service.mint(amount, recipient, refId);

            expect(mockLedgerService.recordTransaction).toHaveBeenCalled();
            expect(mockSmartContractService.recordReference).toHaveBeenCalledWith(refId, 'MINT', expect.any(Object));
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(result.status).toBe('SUCCESS');
        });

        it('should rollback if ledger fails', async () => {
            mockLedgerService.recordTransaction.mockRejectedValue(new Error('Ledger Error'));

            await expect(service.mint('100', 'REC_1', 'REF_1'))
                .rejects.toThrow('Ledger Error');

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
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
