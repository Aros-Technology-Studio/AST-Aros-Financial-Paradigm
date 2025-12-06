import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeRequestEntity } from './bridge_request.entity';
import { ExternalAssetEntity } from './external_asset.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([BridgeRequestEntity, ExternalAssetEntity]),
    ],
    providers: [],
    exports: [],
})
export class BridgeModule { }
