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
                username: configService.get<string>('DB_USERNAME', 'aros_user'),
                password: configService.get<string>('DB_PASSWORD', 'aros_password'),
                database: configService.get<string>('DB_DATABASE', 'aros_ast'),
                entities: [__dirname + '/**/*.entity{.ts,.js}'],
                synchronize: configService.get<string>('NODE_ENV') !== 'production',
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
    ],
})
export class AppModule { }
