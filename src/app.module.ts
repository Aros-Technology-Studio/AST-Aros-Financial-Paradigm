import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NodeChainModule } from './nodechain/nodechain.module';
import { BridgeModule } from './bridge/bridge.module';
import { TokenModule } from './token/token.module';
import { GovernanceModule } from './governance/governance.module';
import { FeeDistributionModule } from './fee_distribution/fee_distribution.module';
import { ProcessingModule } from './processing/processing.module';
import { AiAgentsModule } from './ai_agents/ai_agents.module';
import { NodeChainEngineModule } from './nodechain_engine/nodechain_engine.module';
import { PoTEngineModule } from './proof_of_transaction_engine/pot_engine.module';
import { LedgerModule } from './ledger/ledger.module';
import { DteModule } from './dte/dte.module';
import { NodeSecurityModule } from './node_security/node_security.module';
import { AstNodeModule } from './ast_node/ast_node.module';
import { OversightModule } from './oversight/oversight.module';
import { ExternalProviderModule } from './bridge/external_provider.module';

import { LifecycleService } from './common/lifecycle.service';
import { HandshakeController } from './common/handshake.controller';
import { SystemStatusGuard } from './common/system_status.guard';
import { AppController } from './app.controller';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get<string>('DB_HOST', 'localhost'),
                port: configService.get<number>('DB_PORT', 5432),
                username: configService.get<string>('DB_USER', 'postgres'),
                password: configService.get<string>('DB_PASSWORD', 'postgres'),
                database: configService.get<string>('DB_NAME', 'ast_platform'),
                entities: [__dirname + '/**/*.entity{.ts,.js}'],
                synchronize: true, // Auto-create tables (DEV only)
            }),
            inject: [ConfigService],
        }),
        NodeChainEngineModule,
        PoTEngineModule,
        NodeChainModule,
        BridgeModule,
        TokenModule,
        GovernanceModule,
        FeeDistributionModule,
        ProcessingModule,
        AiAgentsModule,
        LedgerModule,
        DteModule,
        NodeSecurityModule,
        AstNodeModule,
        OversightModule,
        ExternalProviderModule,
    ],
    controllers: [AppController, HandshakeController],
    providers: [
        LifecycleService,
        {
            provide: APP_GUARD,
            useClass: SystemStatusGuard,
        },
    ],
})
export class AppModule { }
