import { Injectable, InternalServerErrorException, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import * as crypto from 'crypto';

import { TxEncoderService } from '../encoding/tx_encoder.service';

@Injectable()
export class LedgerService {
    private readonly logger = new Logger(LedgerService.name);

    constructor(
        @InjectRepository(Transaction)
        private readonly txRepository: Repository<Transaction>,
        private readonly dataSource: DataSource,
        private readonly eventEmitter: EventEmitter2,
        private readonly txEncoder: TxEncoderService,
    ) { }

    /**
     * Records a transaction on the ledger.
     *
     * @param dto         Transaction data to persist.
     * @param externalRunner  Optional QueryRunner supplied by the caller.
     *                    When provided, the method participates in the caller's
     *                    existing transaction — it does NOT connect, commit,
     *                    or release the runner. This enables true multi-step
     *                    atomicity (e.g. the canonical emission lifecycle).
     *                    When omitted, the method manages its own transaction.
     */
    async recordTransaction(dto: Partial<Transaction>, externalRunner?: QueryRunner): Promise<Transaction> {
        const ownedRunner = !externalRunner;
        const queryRunner  = externalRunner ?? this.dataSource.createQueryRunner();

        if (ownedRunner) {
            await queryRunner.connect();
            await queryRunner.startTransaction();
        }

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

            if (ownedRunner) {
                await queryRunner.commitTransaction();
            }

            this.logger.log(`Transaction recorded at height ${savedTx.ledgerHeight}: ${savedTx.hash}`);

            this.eventEmitter.emit('ledger.transaction.recorded', {
                hash: savedTx.hash,
                ledgerHeight: savedTx.ledgerHeight,
                sender: savedTx.sender,
                nonce: savedTx.nonce,
                amount: savedTx.amount
            });

            return savedTx;

        } catch (error) {
            if (ownedRunner) {
                await queryRunner.rollbackTransaction();
            }
            this.logger.error(`Failed to record transaction: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Ledger recording failed');
        } finally {
            if (ownedRunner) {
                await queryRunner.release();
            }
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
        // Use Module 14: TX Encoding (Binary CBOR)
        const buffer = this.txEncoder.hashTransaction(tx);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }
}
