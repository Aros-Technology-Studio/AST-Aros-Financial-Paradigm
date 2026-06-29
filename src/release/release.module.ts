import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { ReserveModule } from '../reserve/reserve.module';
import { ReleasePhase } from './entities/release-phase.entity';
import { ReleaseService } from './release.service';

/**
 * Release module — the maturity gate to broader circulation.
 *
 * Wires `ReleaseService`. It imports `ReserveModule` (capitalization index), `ArosCoinModule`
 * (circulating supply for velocity), `NodeChainModule` (to record activation), and the
 * TypeORM repository for the single-row `ReleasePhase` that holds the current phase state.
 * The service is exported so the orchestrator can monitor maturity and activate the phase.
 *
 * Spec: docs/specs/AST_Release_AGENT_EN.md
 * Reference: reference/ast-core/src/release.ts
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([ReleasePhase]),
        ReserveModule,
        ArosCoinModule,
        NodeChainModule,
    ],
    providers: [ReleaseService],
    exports: [ReleaseService],
})
export class ReleaseModule { }
