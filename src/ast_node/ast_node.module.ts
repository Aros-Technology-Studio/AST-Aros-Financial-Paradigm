import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AstNodeController } from './ast_node.controller';
import { AstNodeService } from './ast_node.service';
import { DteModule } from '../dte/dte.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ValidatorModule } from '../validator/validator.module';
import { LedgerBatch } from '../ledger/entities/ledger_batch.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([LedgerBatch]), // Needed to save batches directly
        DteModule,
        LedgerModule,
        ValidatorModule
    ],
    controllers: [AstNodeController],
    providers: [AstNodeService],
})
export class AstNodeModule { }
