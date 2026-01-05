import { Injectable, Logger } from '@nestjs/common';
import { DteService } from '../dte/dte.service';
import { LedgerService } from '../ledger/ledger.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerBatch } from '../ledger/entities/ledger_batch.entity';
import { sha3_512 } from 'js-sha3';
import { TransactionType } from '../ledger/entities/transaction.entity';

@Injectable()
export class AstNodeService {
    private readonly logger = new Logger(AstNodeService.name);

    constructor(
        private readonly dteService: DteService,
        private readonly ledgerService: LedgerService,
        @InjectRepository(LedgerBatch)
        private readonly batchRepo: Repository<LedgerBatch>,
    ) { }

    /**
     * Processes an incoming raw transaction:
     * 1. Validate (DTE)
     * 2. Encode & Hash (DTE)
     * 3. Send to Ledger (Mempool/Storage)
     */
    async processTransaction(rawTx: any) {
        this.logger.log('Processing incoming transaction...');

        // 1. Validate
        this.dteService.validateTransaction(rawTx);

        // 2. Encode & Hash
        const encoded = this.dteService.encodeTransaction(rawTx);
        const txId = this.dteService.hashTransaction(encoded);

        // 3. Persist to Ledger
        // In a real node, this goes to Mempool first. Here we save as 'pending' (but recordTransaction sets it to CONFIRMED for now per user implementation).
        const savedTx = await this.ledgerService.recordTransaction({
            sender: rawTx.sender,
            recipient: rawTx.recipient,
            amount: rawTx.amount,
            currency: rawTx.asset || 'AROS',
            type: TransactionType.TRANSFER,
            nonce: Date.now(),
            metadata: { originalTxId: txId },
        });

        this.logger.log(`Transaction ${txId} processed and saved to ledger.`);
        return savedTx;
    }

    /**
     * Finalizes a Ledger Batch.
     * Aggregates pending transactions and creates a LedgerBatch entity.
     */
    async finalizeBatch() {
        this.logger.log('Finalizing new ledger batch...');

        // In a real implementation: fetch pending txs from LedgerService
        // For MVP: We just create a new batch and assume it "includes" recent txs implicitly by epoch linkage

        const batchId = sha3_512(new Date().toISOString() + Math.random());

        const batch = this.batchRepo.create({
            batch_id: batchId,
            epoch_id: '1', // Mocked epoch linkage
            height: '100', // Mocked height
            merkle_root: '0x0000000000000000000000000000000000000000000000000000000000000000', // Mocked
            prev_batch_hash: '0xGENESIS', // Mocked
        });

        await this.batchRepo.save(batch);
        this.logger.log(`Batch ${batchId} finalized and saved.`);

        return batch;
    }
}
