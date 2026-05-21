import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenService } from './token.service';
import { TokenController } from './token.controller';
import { TokenomicsService } from './tokenomics.service';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { AfcReserveSnapshotEntity } from './entities/afc_reserve_snapshot.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { BridgeModule } from '../bridge/bridge.module';
import { IntegrationModule } from '../integration/integration.module';
import { PoTEngineModule } from '../proof_of_transaction_engine/pot_engine.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([SupplySnapshot, AfcReserveSnapshotEntity]),
        LedgerModule,
        PoTEngineModule,
        forwardRef(() => BridgeModule),
        IntegrationModule
    ],
    controllers: [TokenController],
    providers: [TokenService, TokenomicsService, EmissionService],
    exports: [TokenService, TokenomicsService, EmissionService],
})
export class TokenModule { }
