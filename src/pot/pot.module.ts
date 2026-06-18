import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { StateRecordingModule } from '../state-recording/state-recording.module';
import { PotVerdict } from './entities/pot-verdict.entity';
import { PotService } from './pot.service';

/**
 * PoT (Proof of Transaction) module — the verdict engine.
 *
 * Wires the TypeORM repository for `PotVerdict` and exposes `PotService`, which reads the
 * execution events recorded by StateRecording, issues a deterministic binary verdict, and
 * records that verdict in NodeChain. The verdict is the gate that authorizes downstream
 * value and emission (project I1, spec I-PoT-1).
 *
 * Spec: docs/specs/AST_PoT_AGENT_EN.md
 * Reference: reference/ast-core/src/pot.ts
 */
@Module({
    imports: [
        NodeChainModule,
        StateRecordingModule,
        TypeOrmModule.forFeature([PotVerdict]),
    ],
    providers: [PotService],
    exports: [PotService],
})
export class PotModule { }
