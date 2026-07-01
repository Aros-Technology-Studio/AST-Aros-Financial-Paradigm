import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodesModule } from '../nodes/nodes.module';
import { PotModule } from '../pot/pot.module';
import { ReserveModule } from '../reserve/reserve.module';
import { CommissionService } from './commission.service';
import { Epoch } from './entities/epoch.entity';

/**
 * Commission module — the settlement controller of AST.
 *
 * Wires the TypeORM repository for `Epoch` and exposes `CommissionService`, which computes
 * the operation fee, pools fees per epoch, and on finalization distributes by the canonical
 * 75/25 split: 75% to nodes by PoT-confirmed participation weight, and 25% to the AFC Reserve
 * (via ReserveService.addAfcAccrual) as an audit-trail accrual; the capitalization index itself
 * grows only from confirmed process volume (spec I-RS-1), not from AFC accruals.
 * Imports NodesModule (pays nodes), PotModule (gates participation on verdict),
 * NodeChainModule (records the distribution), ArosCoinModule (records node earned value), and
 * ReserveModule (routes the AFC share).
 *
 * Spec: docs/specs/AST_Commission_AGENT_EN.md
 * Reference: reference/ast-core/src/commission.ts
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([Epoch]),
        NodesModule,
        PotModule,
        NodeChainModule,
        ArosCoinModule,
        ReserveModule,
    ],
    providers: [CommissionService],
    exports: [CommissionService],
})
export class CommissionModule { }
