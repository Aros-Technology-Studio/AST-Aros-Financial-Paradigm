import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenTransactionEntity } from './token_transaction.entity';
import { SupplySnapshotEntity } from './supply_snapshot.entity';
import { EmissionEventEntity } from './emission_event.entity';

import { TokenEconomicsService } from './token_economics.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([TokenTransactionEntity, SupplySnapshotEntity, EmissionEventEntity]),
    ],
    providers: [TokenEconomicsService],
    exports: [TokenEconomicsService],
})
export class TokenModule { }
