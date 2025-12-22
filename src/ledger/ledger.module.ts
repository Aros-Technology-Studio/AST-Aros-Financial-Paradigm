import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { Transaction } from './entities/transaction.entity';
import { LedgerBatch } from './entities/ledger_batch.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Transaction, LedgerBatch])],
    controllers: [LedgerController],
    providers: [LedgerService],
    exports: [LedgerService],
})
export class LedgerModule { }
