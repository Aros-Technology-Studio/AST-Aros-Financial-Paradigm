
import { Module } from '@nestjs/common';
import { NodeChainService } from './nodechain.service';
import { ShardingManager } from './sharding.manager';
import { GossipSimulationService } from './gossip.simulation';

@Module({
    providers: [NodeChainService, ShardingManager, GossipSimulationService],
    exports: [NodeChainService],
})
export class NodeChainEngineModule { }
