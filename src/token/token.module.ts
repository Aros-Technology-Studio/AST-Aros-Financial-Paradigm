import { Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { TokenController } from './token.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenEntity } from './token.entity';
import { SupplySnapshotEntity } from './supply_snapshot.entity';
import { TokenomicsService } from './tokenomics.service';

@Module({
    imports: [TypeOrmModule.forFeature([TokenEntity, SupplySnapshotEntity])],
    controllers: [TokenController],
    providers: [TokenService, TokenomicsService],
    exports: [TokenService, TokenomicsService]
})
export class TokenModule { }
