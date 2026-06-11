import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenService } from './token.service';
import { TokenController } from './token.controller';
import { EmissionService } from './emission.service';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { BridgeModule } from '../bridge/bridge.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([SupplySnapshot]),
        LedgerModule,
        forwardRef(() => BridgeModule),
        IntegrationModule,
    ],
    controllers: [TokenController],
    providers: [TokenService, EmissionService],
    exports: [TokenService, EmissionService],
})
export class TokenModule { }
