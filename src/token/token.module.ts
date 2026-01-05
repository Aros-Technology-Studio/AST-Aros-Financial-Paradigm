import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenService } from './token.service';
import { TokenController } from './token.controller';
import { SupplySnapshot } from './entities/supply_snapshot.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { BridgeModule } from '../bridge/bridge.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([SupplySnapshot]),
        LedgerModule,
        forwardRef(() => BridgeModule),
    ],
    controllers: [TokenController],
    providers: [TokenService],
    exports: [TokenService],
})
export class TokenModule { }
