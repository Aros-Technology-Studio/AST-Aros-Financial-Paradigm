import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Block } from './entities/block.entity';

@Injectable()
export class LedgerService {
    constructor(
        @InjectRepository(Transaction)
        private readonly transactionRepo: Repository<Transaction>,
        @InjectRepository(Block)
        private readonly blockRepo: Repository<Block>,
    ) { }

    async createTransaction(data: Partial<Transaction>): Promise<Transaction> {
        const tx = this.transactionRepo.create({
            ...data,
            status: 'pending',
            timestamp: new Date()
        });
        return this.transactionRepo.save(tx);
    }

    async getTransaction(tx_id: string): Promise<Transaction> {
        const tx = await this.transactionRepo.findOne({ where: { tx_id } });
        if (!tx) {
            throw new NotFoundException(`Transaction ${tx_id} not found`);
        }
        return tx;
    }

    async getEpochSummary(epoch_id: string): Promise<any> {
        const txs = await this.transactionRepo.find({ where: { epoch_id } });
        const blocks = await this.blockRepo.find({ where: { epoch_id } });

        // Aggregation logic placeholder
        const totalVolume = txs.reduce((acc, tx) => acc + parseFloat(tx.amount), 0);

        return {
            epoch_id,
            transaction_count: txs.length,
            block_count: blocks.length,
            total_volume: totalVolume,
            transactions: txs.map(t => t.tx_id),
            blocks: blocks.map(b => b.block_id)
        };
    }
}
