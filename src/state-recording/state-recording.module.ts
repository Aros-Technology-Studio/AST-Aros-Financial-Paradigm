import { Module } from '@nestjs/common';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { StateRecordingService } from './state-recording.service';

/**
 * StateRecording module — the bridge between live process events and the NodeChain ledger.
 *
 * Provides StateRecordingService, which captures significant process events, tracks per-process
 * coverage, and forwards each event to NodeChainService.append() so it becomes a permanent
 * ExecutionSnapshot. NodeChainModule is imported so NodeChainService can be injected.
 *
 * Spec: docs/specs/AST_StateRecording_AGENT_EN.md
 * Reference: reference/ast-core/src/stateRecording.ts
 */
@Module({
    imports: [NodeChainModule],
    providers: [StateRecordingService],
    exports: [StateRecordingService],
})
export class StateRecordingModule { }
