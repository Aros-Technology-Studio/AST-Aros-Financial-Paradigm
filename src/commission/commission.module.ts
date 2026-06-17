import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArosCoinModule } from '../aroscoin/aroscoin.module';
import { NodeChainModule } from '../nodechain/nodechain.module';
import { NodesModule } from '../nodes/nodes.module';
import { PotModule } from '../pot/pot.module';
import { CommissionService } from './commission.service';
import { Epoch } from './entities/epoch.entity';

/**
 * Commission module — the settlement controller of AST.
 *
 * Wires the TypeORM repository for `Epoch` and exposes `CommissionService`, which computes
 * the operation fee, pools fees per epoch, and on finalization pays nodes post-factum by
 * their PoT-confirmed participation weight while allocating the operational margin to AST.
 * Imports NodesModule (pays nodes by weight), PotModule (gates participation on verdict),
 * NodeChainModule (records the distribution), and ArosCoinModule (records earned value).
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
    ],
    providers: [CommissionService],
    exports: [CommissionService],
})
export class CommissionModule { }
