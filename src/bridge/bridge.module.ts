import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeController } from './bridge.controller';
import { BridgeService } from './bridge.service';
import { BridgeRequest } from './entities/bridge_request.entity';
import { TokenModule } from '../token/token.module'; // Import TokenModule to use TokenService

@Module({
    imports: [
        TypeOrmModule.forFeature([BridgeRequest]),
        TokenModule, // Импортируем, чтобы BridgeService мог инжектировать TokenService
    ],
    controllers: [BridgeController],
    providers: [BridgeService],
    exports: [BridgeService]
})
export class BridgeModule { }
