import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { LedgerBatch } from './entities/ledger_batch.entity';

@Injectable()
export class LedgerService {
    constructor(
        @InjectRepository(Transaction)
        private readonly txRepo: Repository<Transaction>,
        @InjectRepository(LedgerBatch)
        private readonly batchRepo: Repository<LedgerBatch>,
    ) { }

    async createTransaction(data: Partial<Transaction>): Promise<Transaction> {
        const tx = this.txRepo.create({
            ...data,
            status: 'pending',
            timestamp: new Date()
        });
        return this.txRepo.save(tx);
    }

    async getTransaction(tx_id: string): Promise<Transaction> {
        const tx = await this.txRepo.findOne({ where: { tx_id } });
        if (!tx) {
            throw new NotFoundException(`Transaction ${tx_id} not found`);
        }
        return tx;
    }

    async getEpochSummary(epoch_id: string): Promise<any> {
        const txs = await this.txRepo.find({ where: { epoch_id } });
        const batches = await this.batchRepo.find({ where: { epoch_id } });

        // Aggregation logic placeholder
        const totalVolume = txs.reduce((acc, tx) => acc + parseFloat(tx.amount), 0);

        return {
            epoch_id,
            transaction_count: txs.length,
            batch_count: batches.length,
            total_volume: totalVolume,
            transactions: txs.map(t => t.tx_id),
            batches: batches.map(b => b.batch_id)
        };
    }
}
