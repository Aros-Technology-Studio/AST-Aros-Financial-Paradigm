import { Module } from '@nestjs/common';
import { TokenManagementService } from './token-management.service';
import { TokenManagementController } from './token-management.controller';

@Module({
    controllers: [TokenManagementController],
    providers: [TokenManagementService],
    exports: [TokenManagementService],
})
export class TokenManagementModule { }
