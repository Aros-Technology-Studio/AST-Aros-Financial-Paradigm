import { Injectable, Logger } from '@nestjs/common';
import { DteService } from '../dte/dte.service';
import { LedgerService } from '../ledger/ledger.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Block } from '../ledger/entities/block.entity';
import { sha3_512 } from 'js-sha3';

@Injectable()
export class AstNodeService {
    private readonly logger = new Logger(AstNodeService.name);

    constructor(
        private readonly dteService: DteService,
        private readonly ledgerService: LedgerService,
        @InjectRepository(Block)
        private readonly blockRepo: Repository<Block>,
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
        // In a real node, this goes to Mempool first. Here we save as 'pending'.
        const savedTx = await this.ledgerService.createTransaction({
            tx_id: txId,
            sender: rawTx.sender,
            recipient: rawTx.recipient,
            amount: rawTx.amount,
            asset: rawTx.asset,
            // In real DTE, these come from the encoded payload structure
            status: 'pending',
        });

        this.logger.log(`Transaction ${txId} processed and saved to ledger.`);
        return savedTx;
    }

    /**
     * Simulates mining a block.
     * Aggregates pending transactions (mocked logic) and creates a Block entity.
     */
    async mineBlock() {
        this.logger.log('Mining new block...');

        // In a real implementation: fetch pending txs from LedgerService
        // For MVP: We just create a new block and assume it "includes" recent txs implicitly by epoch linkage

        const blockId = sha3_512(new Date().toISOString() + Math.random());

        const block = this.blockRepo.create({
            block_id: blockId,
            epoch_id: '1', // Mocked epoch linkage
            height: '100', // Mocked height
            merkle_root: '0x0000000000000000000000000000000000000000000000000000000000000000', // Mocked
            prev_block_hash: '0xGENESIS', // Mocked
        });

        await this.blockRepo.save(block);
        this.logger.log(`Block ${blockId} mined and saved.`);

        return block;
    }
}
