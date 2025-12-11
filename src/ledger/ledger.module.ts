import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { Transaction } from './entities/transaction.entity';
import { Block } from './entities/block.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Transaction, Block])],
    controllers: [LedgerController],
    providers: [LedgerService],
    exports: [LedgerService],
})
export class LedgerModule { }
