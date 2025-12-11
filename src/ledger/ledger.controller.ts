import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { Transaction } from './entities/transaction.entity';

@Controller('ledger')
export class LedgerController {
    constructor(private readonly ledgerService: LedgerService) { }

    @Post('tx')
    async createTransaction(@Body() body: Partial<Transaction>) {
        return this.ledgerService.createTransaction(body);
    }

    @Get('tx/:id')
    async getTransaction(@Param('id') id: string) {
        return this.ledgerService.getTransaction(id);
    }

    @Get('epoch/:id/summary')
    async getEpochSummary(@Param('id') id: string) {
        return this.ledgerService.getEpochSummary(id);
    }
}
