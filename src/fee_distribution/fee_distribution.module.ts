import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpochEntity } from './epoch.entity';
import { DistributionLogEntity } from './distribution_log.entity';
import { Transaction } from '../ledger/entities/transaction.entity';
import { FeeDistributionService } from './fee_distribution.service';
import { PoTEngineModule } from '../proof_of_transaction_engine/pot_engine.module'; // Adjust path if needed
import { TokenModule } from '../token/token.module';
import { NodeChainEngineModule } from '../nodechain_engine/nodechain_engine.module';
import { FeeDistributionFraudPreventionService } from './fraud-prevention.service';
import { SmartContractIntegration } from '../integration/smart_contract.integration';

@Module({
    imports: [
        TypeOrmModule.forFeature([EpochEntity, DistributionLogEntity, Transaction]),
        PoTEngineModule,
        TokenModule,
        NodeChainEngineModule
    ],
    providers: [FeeDistributionService, FeeDistributionFraudPreventionService, SmartContractIntegration],
    exports: [FeeDistributionService],
})
export class FeeDistributionModule { }
