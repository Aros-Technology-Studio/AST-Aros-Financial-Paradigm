import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { Transaction } from './entities/transaction.entity';

@Controller('api/v1/ledger')
export class LedgerController {
    constructor(private readonly ledgerService: LedgerService) { }

    @Post('record')
    async recordTransaction(@Body() dto: Partial<Transaction>) {
        return this.ledgerService.recordTransaction(dto);
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
