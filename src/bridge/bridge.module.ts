import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeRequestEntity } from './bridge_request.entity';
import { ExternalAssetEntity } from './external_asset.entity';
import { JttEntity } from './jtt.entity';
import { LegalBridgeService } from './legal_bridge.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([BridgeRequestEntity, ExternalAssetEntity, JttEntity]),
    ],
    providers: [LegalBridgeService],
    exports: [LegalBridgeService],
})
export class BridgeModule { }
