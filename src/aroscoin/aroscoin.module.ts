import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinService } from './aroscoin.service';
import { ArosCoinLedger } from './entities/aroscoin-ledger.entity';

/**
 * ArosCoin module — the process unit of account of AST.
 *
 * Wires the TypeORM repository for the single-row `ArosCoinLedger` and exposes
 * `ArosCoinService`. Supply tallies are persisted so the derived totalSupply survives
 * restarts; the service derives every supply figure from those tallies (project I6).
 * Emission and Commission inject this service to record process-part mint/burn and
 * earned value respectively.
 *
 * Spec: docs/specs/AST_ArosCoin_AGENT_EN.md
 * Reference: reference/ast-core/src/aroscoin.ts
 */
@Module({
    imports: [TypeOrmModule.forFeature([ArosCoinLedger])],
    providers: [ArosCoinService],
    exports: [ArosCoinService],
})
export class ArosCoinModule { }
