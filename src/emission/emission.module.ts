import { Module } from '@nestjs/common';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { PotModule } from '../pot/pot.module';
import { EmissionService } from './emission.service';

/**
 * Emission module — the PoT-gated supply control of AST.
 *
 * Imports ArosCoinModule (the unit ledger it records into), PotModule (the verdict it gates
 * on) and NodeChainModule (where mint/burn events are recorded), and exposes EmissionService.
 * Emission is the only minter of ArosCoin and acts strictly within confirmed processes
 * (project P7, spec I-EM-1/I-EM-2).
 *
 * Spec: docs/specs/AST_Emission_AGENT_EN.md
 * Reference: reference/ast-core/src/emission.ts
 */
@Module({
    imports: [ArosCoinModule, PotModule, NodeChainModule],
    providers: [EmissionService],
    exports: [EmissionService],
})
export class EmissionModule { }
