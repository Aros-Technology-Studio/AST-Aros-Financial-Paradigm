import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodeEntity } from './entities/node.entity';
import { NodesService } from './nodes.service';

/**
 * Nodes module — registers nodes and tracks influence from work and reputation, with
 * post-factum payment and retention. Imports NodeChainModule so registration and
 * payment receipts can be appended to the append-only history.
 *
 * Spec: docs/specs/AST_Nodes_AGENT_EN.md
 * Reference: reference/ast-core/src/nodes.ts
 */
@Module({
    imports: [TypeOrmModule.forFeature([NodeEntity]), NodeChainModule],
    providers: [NodesService],
    exports: [NodesService],
})
export class NodesModule { }
