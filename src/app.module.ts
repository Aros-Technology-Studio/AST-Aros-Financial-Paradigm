import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NodeChainModule } from './nodechain/nodechain.module';
import { BridgeModule } from './bridge/bridge.module';
import { TokenModule } from './token/token.module';
import { GovernanceModule } from './governance/governance.module';
import { EmissionModule } from './emission/emission.module';
import { ProcessingModule } from './processing/processing.module';
import { AiAgentsModule } from './ai_agents/ai_agents.module';
import { NodeChainEngineModule } from './nodechain_engine/nodechain_engine.module';

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
        NodeChainModule,
        BridgeModule,
        TokenModule,
        GovernanceModule,
        EmissionModule,
        ProcessingModule,
        AiAgentsModule,
    ],
    controllers: [AppController],
    providers: [],
})
export class AppModule { }
