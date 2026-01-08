import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import * as crypto from 'crypto';

@Injectable()
export class LedgerService {
    private readonly logger = new Logger(LedgerService.name);

    constructor(
        @InjectRepository(Transaction)
        private readonly txRepository: Repository<Transaction>,
        private readonly dataSource: DataSource,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    async recordTransaction(dto: Partial<Transaction>): Promise<Transaction> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const lastTx = await queryRunner.manager
                .getRepository(Transaction)
                .createQueryBuilder('tx')
                .setLock('pessimistic_write')
                .orderBy('tx.createdAt', 'DESC')
                .addOrderBy('tx.ledgerHeight', 'DESC')
                .limit(1)
                .getOne();

            const previousHash = lastTx ? lastTx.hash : 'GENESIS_HASH_00000000000000000000000000000000';
            const currentHeight = lastTx ? BigInt(lastTx.ledgerHeight) + 1n : 1n;

            const newTx = new Transaction();
            Object.assign(newTx, dto);

            newTx.previousHash = previousHash;
            newTx.ledgerHeight = currentHeight.toString();
            newTx.status = TransactionStatus.CONFIRMED;
            newTx.finalizedAt = new Date();
            newTx.hash = this.calculateHash(newTx);

            const savedTx = await queryRunner.manager.save(Transaction, newTx);
            await queryRunner.commitTransaction();

            this.logger.log(`Transaction recorded at height ${savedTx.ledgerHeight}: ${savedTx.hash}`);

            this.eventEmitter.emit('ledger.transaction.recorded', {
                hash: savedTx.hash,
                ledgerHeight: savedTx.ledgerHeight,
                sender: savedTx.sender,
                nonce: savedTx.nonce
            });

            return savedTx;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Failed to record transaction: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Ledger recording failed');
        } finally {
            await queryRunner.release();
        }
    }

    async getBalance(address: string): Promise<string> {
        const incoming = await this.txRepository
            .createQueryBuilder('tx')
            .select('SUM(CAST(tx.amount AS DECIMAL))', 'total')
            .where('tx.recipient = :address', { address })
            .andWhere('tx.status = :status', { status: TransactionStatus.CONFIRMED })
            .getRawOne();

        const outgoing = await this.txRepository
            .createQueryBuilder('tx')
            .select('SUM(CAST(tx.amount AS DECIMAL))', 'total')
            .where('tx.sender = :address', { address })
            .andWhere('tx.status = :status', { status: TransactionStatus.CONFIRMED })
            .getRawOne();

        const incomeVal = parseFloat(incoming.total || '0');
        const outcomeVal = parseFloat(outgoing.total || '0');
        return (incomeVal - outcomeVal).toFixed(8);
    }

    async getHistory(address: string, limit: number = 20): Promise<Transaction[]> {
        return this.txRepository.find({
            where: [{ sender: address }, { recipient: address }],
            order: { createdAt: 'DESC' },
            take: limit
        });
    }

    async getRecentTransactions(limit: number = 50): Promise<Transaction[]> {
        return this.txRepository.find({
            order: { createdAt: 'DESC' },
            take: limit
        });
    }

    async findByHash(hash: string): Promise<Transaction> {
        const tx = await this.txRepository.findOneBy({ hash });
        if (!tx) throw new BadRequestException('Transaction not found');
        return tx;
    }

    private calculateHash(tx: Transaction): string {
        const payload = JSON.stringify({
            prev: tx.previousHash,
            h: tx.ledgerHeight,
            s: tx.sender,
            r: tx.recipient,
            a: tx.amount,
            n: tx.nonce,
            sig: tx.signature,
            ts: new Date().toISOString()
        });
        return crypto.createHash('sha256').update(payload).digest('hex');
    }
}
