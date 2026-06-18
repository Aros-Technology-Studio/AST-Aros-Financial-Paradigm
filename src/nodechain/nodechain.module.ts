import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionSnapshot } from './entities/execution-snapshot.entity';
import { NodeChainService } from './nodechain.service';

/**
 * NodeChain module — the system of record of AST.
 *
 * Wires the TypeORM repository for `ExecutionSnapshot` and exposes `NodeChainService`,
 * which other modules use to record events and to read the immutable history. The
 * service surface is intentionally append + read only, enforcing invariant I-NC-1.
 *
 * Spec: docs/specs/AST_NodeChain_AGENT_EN.md
 * Reference: reference/ast-core/src/nodechain.ts
 */
@Module({
    imports: [TypeOrmModule.forFeature([ExecutionSnapshot])],
    providers: [NodeChainService],
    exports: [NodeChainService],
})
export class NodeChainModule { }
