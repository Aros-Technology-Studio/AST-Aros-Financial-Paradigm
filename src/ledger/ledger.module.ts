import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { Transaction } from './entities/transaction.entity';
import { EncodingModule } from '../encoding/encoding.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Transaction]),
        forwardRef(() => ProcessingModule),
        EncodingModule
    ],
    controllers: [LedgerController],
    providers: [LedgerService],
    exports: [LedgerService],
})
export class LedgerModule { }
