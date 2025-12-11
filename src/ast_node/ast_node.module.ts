import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AstNodeController } from './ast_node.controller';
import { AstNodeService } from './ast_node.service';
import { DteModule } from '../dte/dte.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ValidatorModule } from '../validator/validator.module';
import { Block } from '../ledger/entities/block.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Block]), // Needed to save blocks directly
        DteModule,
        LedgerModule,
        ValidatorModule
    ],
    controllers: [AstNodeController],
    providers: [AstNodeService],
})
export class AstNodeModule { }
