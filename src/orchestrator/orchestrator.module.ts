import { Module } from '@nestjs/common';
import { AllSeeingEyeModule } from '../all-seeing-eye/all-seeing-eye.module';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { CommissionModule } from '../commission/commission.module';
import { EmissionModule } from '../emission/emission.module';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodesModule } from '../nodes/nodes.module';
import { PotModule } from '../pot/pot.module';
import { ReleaseModule } from '../release/release.module';
import { ReserveModule } from '../reserve/reserve.module';
import { StateRecordingModule } from '../state-recording/state-recording.module';
import { MetricsController } from './metrics.controller';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

/**
 * ProcessOrchestrator module — wires every feature module into the full Model-1 lifecycle and
 * exposes it over HTTP.
 *
 * It imports each entity module it orchestrates (StateRecording, PoT, Emission, ArosCoin,
 * Commission, Nodes, Reserve, Release, AllSeeingEye, NodeChain), provides OrchestratorService
 * which drives the loop, and declares the controllers that surface it: process run/read and a
 * read-only metrics endpoint with epoch finalization. The service is exported so other modules
 * (or e2e harnesses) can drive the lifecycle directly.
 *
 * Spec: docs/specs/AST_Ontology_FULL_AGENT_EN.md
 * Reference: reference/ast-core/src/orchestrator.ts
 */
@Module({
    imports: [
        StateRecordingModule,
        PotModule,
        EmissionModule,
        ArosCoinModule,
        CommissionModule,
        NodesModule,
        ReserveModule,
        ReleaseModule,
        AllSeeingEyeModule,
        NodeChainModule,
    ],
    controllers: [OrchestratorController, MetricsController],
    providers: [OrchestratorService],
    exports: [OrchestratorService],
})
export class OrchestratorModule { }
