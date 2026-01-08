import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { Transaction } from './entities/transaction.entity';
import { ProcessingModule } from '../processing/processing.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Transaction]),
        forwardRef(() => ProcessingModule)
    ],
    controllers: [LedgerController],
    providers: [LedgerService],
    exports: [LedgerService],
})
export class LedgerModule { }
