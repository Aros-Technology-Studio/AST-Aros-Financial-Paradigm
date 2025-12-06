import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeEntity } from './node.entity';
import { ShardEntity } from './shard.entity';
import { ConsensusEventEntity } from './consensus_event.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([NodeEntity, ShardEntity, ConsensusEventEntity]),
    ],
    providers: [],
    exports: [],
})
export class NodeChainModule { }
