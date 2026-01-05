import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeController } from './bridge.controller';
import { BridgeService } from './bridge.service';
import { BridgeRequest } from './entities/bridge_request.entity';
import { TokenModule } from '../token/token.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([BridgeRequest]),
        forwardRef(() => TokenModule),
    ],
    controllers: [BridgeController],
    providers: [BridgeService],
    exports: [BridgeService]
})
export class BridgeModule { }
