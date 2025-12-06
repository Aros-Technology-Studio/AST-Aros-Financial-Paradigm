
import { Module } from '@nestjs/common';
import { NodeChainService } from './nodechain.service';

@Module({
    providers: [NodeChainService],
    exports: [NodeChainService],
})
export class NodeChainEngineModule { }
