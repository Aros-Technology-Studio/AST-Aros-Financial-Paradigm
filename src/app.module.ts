import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LedgerModule } from './ledger/ledger.module';
import { TokenModule } from './token/token.module';
import { BridgeModule } from './bridge/bridge.module';
import { ScheduleModule } from '@nestjs/schedule';
import { FeeDistributionModule } from './fee_distribution/fee_distribution.module';
import { GovernanceModule } from './governance/governance.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SupervisoryModule } from './supervisory/supervisory.module';
import { AiAgentsModule } from './ai_agents/ai_agents.module';

import { BullModule } from '@nestjs/bullmq';
import { ProcessingModule } from './processing/processing.module';

import { SecurityDepositModule } from './security_deposit/security_deposit.module';

import { ValueCirculationModule } from './value_circulation/value_circulation.module';
import { IngestionModule } from './integration/ingestion/ingestion.module';
import { ReleaseDaemonModule } from './supervisory/release_daemon.module';

@Module({
    imports: [
        // ... (existing imports)
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get('REDIS_HOST', 'localhost'),
                    port: config.get('REDIS_PORT', 6379),
                },
            }),
            inject: [ConfigService]
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get<string>('DB_HOST', 'localhost'),
                port: configService.get<number>('DB_PORT', 5432),
                username: configService.get<string>('DB_USERNAME', 'aros_user'),
                password: configService.get<string>('DB_PASSWORD', 'aros_password'),
                database: configService.get<string>('DB_DATABASE', 'aros_ast'),
                entities: [__dirname + '/**/*.entity{.ts,.js}'],
                synchronize: process.env.NODE_ENV === 'development',
                logging: false,
            }),
            inject: [ConfigService],
        }),
        LedgerModule,
        TokenModule,
        BridgeModule,
        ScheduleModule.forRoot(),
        FeeDistributionModule,
        GovernanceModule,
        EventEmitterModule.forRoot(),
        SupervisoryModule,
        AiAgentsModule,
        ProcessingModule,
        SecurityDepositModule,
        ValueCirculationModule,
        IngestionModule,
        ReleaseDaemonModule
    ],
})
export class AppModule { }
