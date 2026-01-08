import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType } from '../ledger/entities/transaction.entity';
import { BridgeService } from '../bridge/bridge.service';
import { SmartContractIntegration } from '../integration/smart_contract.integration';

@Injectable()
export class TokenService {
    private readonly logger = new Logger(TokenService.name);
    private readonly MINT_ADDRESS = 'SYSTEM_MINT_AUTHORITY_000000000000000000';
    private readonly BURN_ADDRESS = 'SYSTEM_BURN_VAULT_00000000000000000000';

    constructor(
        @InjectRepository(SupplySnapshot)
        private readonly supplyRepository: Repository<SupplySnapshot>,
        private readonly ledgerService: LedgerService,
        private readonly dataSource: DataSource,
        @Inject(forwardRef(() => BridgeService))
        private readonly bridgeService: BridgeService,
        private readonly smartContractService: SmartContractIntegration,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    async mint(amount: string, recipient: string, referenceId: string): Promise<any> {
        if (parseFloat(amount) <= 0) throw new BadRequestException('Amount must be positive');

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log(`Initiating MINT: ${amount} AROS to ${recipient} (Ref: ${referenceId})`);

            const tx = await this.ledgerService.recordTransaction({
                type: TransactionType.MINT,
                sender: this.MINT_ADDRESS,
                recipient: recipient,
                amount: amount,
                nonce: Date.now(),
                metadata: { referenceId, operation: 'FIAT_DEPOSIT' }
            });

            // [NEW] Record On-Chain Event
            await this.smartContractService.recordReference(referenceId, 'MINT', { amount: amount, recipient: recipient });

            await this.updateSupplySnapshot(queryRunner, tx.hash, amount, 'MINT');
            await queryRunner.commitTransaction();

            return { status: 'SUCCESS', txHash: tx.hash, amount: tx.amount, recipient: tx.recipient };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Mint failed: ${error.message}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async burn(amount: string, sender: string, bankDetailsId: string): Promise<any> {
        if (parseFloat(amount) <= 0) throw new BadRequestException('Amount must be positive');

        const currentBalance = await this.ledgerService.getBalance(sender);
        if (parseFloat(currentBalance) < parseFloat(amount)) {
            throw new BadRequestException(`Insufficient funds. Balance: ${currentBalance}, Required: ${amount}`);
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.log(`Initiating BURN: ${amount} AROS from ${sender}`);

            const tx = await this.ledgerService.recordTransaction({
                type: TransactionType.BURN,
                sender: sender,
                recipient: this.BURN_ADDRESS,
                amount: amount,
                nonce: Date.now(),
                metadata: { bankDetailsId, operation: 'FIAT_WITHDRAWAL' }
            });

            // [NEW] Record On-Chain Event
            await this.smartContractService.recordReference(tx.hash, 'BURN', { amount: amount, sender: sender });

            await this.updateSupplySnapshot(queryRunner, tx.hash, amount, 'BURN');
            await queryRunner.commitTransaction();

            // Trigger Fiat Payout via Bridge (Asynchronous or Synchronous depending on policy)
            // Ideally async so if bank fails, we don't necessarily rollback burn? 
            // OR strict: if bank fails, we rollback burn.
            // For now, let's treat it as a subsequent action. If Mock Bank fails, we might just log it (or throw).
            // Let's await it to ensure user gets feedback.
            const bankTxId = await this.bridgeService.requestFiatPayout(amount, bankDetailsId);

            return { status: 'SUCCESS', txHash: tx.hash, message: 'Tokens burned. Fiat payout initiated via BB.', bankTxId };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async getSupplyStats(): Promise<SupplySnapshot> {
        return this.supplyRepository.findOne({ order: { createdAt: 'DESC' } });
    }

    private async updateSupplySnapshot(runner: any, txHash: string, amount: string, type: 'MINT' | 'BURN') {
        const [lastSnapshot] = await runner.manager.find(SupplySnapshot, {
            order: { createdAt: 'DESC' },
            take: 1
        });

        const prevSupply = lastSnapshot ? parseFloat(lastSnapshot.circulatingSupply) : 0;
        const prevMinted = lastSnapshot ? parseFloat(lastSnapshot.totalMinted) : 0;
        const prevBurned = lastSnapshot ? parseFloat(lastSnapshot.totalBurned) : 0;
        const delta = parseFloat(amount);

        const newSnapshot = new SupplySnapshot();
        newSnapshot.triggerTransactionHash = txHash;

        if (type === 'MINT') {
            newSnapshot.circulatingSupply = (prevSupply + delta).toString();
            newSnapshot.totalMinted = (prevMinted + delta).toString();
            newSnapshot.totalBurned = prevBurned.toString();
        } else {
            newSnapshot.circulatingSupply = (prevSupply - delta).toString();
            newSnapshot.totalMinted = prevMinted.toString();
            newSnapshot.totalBurned = (prevBurned + delta).toString();
        }

        await runner.manager.save(SupplySnapshot, newSnapshot);
    }
}
