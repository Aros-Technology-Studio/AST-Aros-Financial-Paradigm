import { Module } from '@nestjs/common';
import { NodechainService } from './nodechain.service';

@Module({
    providers: [NodechainService],
    exports: [NodechainService],
})
export class NodechainModule { }
