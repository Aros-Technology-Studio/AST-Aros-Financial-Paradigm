import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenService } from './token.service';
import { TokenController } from './token.controller';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { BridgeModule } from '../bridge/bridge.module';
import { IntegrationModule } from '../integration/integration.module';
import { PoTEngineModule } from '../proof_of_transaction_engine/pot_engine.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([SupplySnapshot]),
        LedgerModule,
        PoTEngineModule,
        forwardRef(() => BridgeModule),
        IntegrationModule,
    ],
    controllers: [TokenController],
    providers: [TokenService, EmissionService],
    exports: [TokenService, EmissionService],
})
export class TokenModule { }
