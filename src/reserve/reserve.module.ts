import { Module } from '@nestjs/common';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { ReserveService } from './reserve.service';

/**
 * Reserve module — AST's own capitalization.
 *
 * Wires `ReserveService`, which derives `reserveIndex` from the confirmed-work volume
 * recorded in NodeChain. It imports `NodeChainModule` to read that history and exports
 * the service so ArosCoin (internal price) and Release (maturity gate) can consume the
 * index. The Reserve persists no state of its own: the index is recomputed from history.
 *
 * Spec: docs/specs/AST_Reserve_AGENT_EN.md
 * Reference: reference/ast-core/src/reserve.ts
 */
@Module({
    imports: [NodeChainModule],
    providers: [ReserveService],
    exports: [ReserveService],
})
export class ReserveModule { }
