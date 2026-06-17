import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { OversightLogEntry } from './entities/oversight-log-entry.entity';
import { AllSeeingEyeService } from './all-seeing-eye.service';

/**
 * AllSeeingEye module — passive supra-process meta-observation layer.
 *
 * Wires the TypeORM repository for `OversightLogEntry`, depends on `NodeChainModule`
 * for read-only access to the system of record, and exposes `AllSeeingEyeService`.
 * The Eye observes, logs, compares, and signals; it never mutates state elsewhere.
 *
 * Spec: docs/specs/AST_AllSeeingEye_AGENT_EN.md
 * Reference: reference/ast-core/src/allSeeingEye.ts
 */
@Module({
    imports: [NodeChainModule, TypeOrmModule.forFeature([OversightLogEntry])],
    providers: [AllSeeingEyeService],
    exports: [AllSeeingEyeService],
})
export class AllSeeingEyeModule { }
