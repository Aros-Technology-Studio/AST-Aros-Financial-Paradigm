import { Controller, Get, Post, Body, Param, Query, Inject, forwardRef } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { Transaction } from './entities/transaction.entity';
import { TxQueueService } from '../processing/tx_queue.service';

@Controller('api/v1/ledger')
export class LedgerController {
    constructor(
        private readonly ledgerService: LedgerService,
        @Inject(forwardRef(() => TxQueueService))
        private readonly txQueue: TxQueueService
    ) { }

    @Post('record')
    async recordTransaction(@Body() dto: Partial<Transaction>) {
        // High-Load Async Processing
        return this.txQueue.enqueueTransaction(dto);
    }

    @Get('balance/:address')
    async getBalance(@Param('address') address: string) {
        const balance = await this.ledgerService.getBalance(address);
        return { address, balance, currency: 'AROS', timestamp: new Date() };
    }

    @Get('history/:address')
    async getHistory(@Param('address') address: string, @Query('limit') limit: number) {
        return this.ledgerService.getHistory(address, limit || 10);
    }

    @Get('recent')
    async getRecent(@Query('limit') limit: number) {
        return this.ledgerService.getRecentTransactions(limit || 20);
    }

    @Get('tx/:hash')
    async getTransaction(@Param('hash') hash: string) {
        return this.ledgerService.findByHash(hash);
    }
}
