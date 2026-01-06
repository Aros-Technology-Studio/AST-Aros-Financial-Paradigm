
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeChainService } from './nodechain.service';
import { ShardingManager } from './sharding.manager';
import { GossipSimulationService } from './gossip.simulation';
import { NodeChainController } from './nodechain.controller';
import { NodeEntity } from './entities/node.entity';
import { ExecutionSnapshotEntity } from './entities/execution_snapshot.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([NodeEntity, ExecutionSnapshotEntity])
    ],
    providers: [NodeChainService, ShardingManager, GossipSimulationService],
    controllers: [NodeChainController],
    exports: [NodeChainService],
})
export class NodeChainEngineModule { }
