import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { NodeChainModule } from './nodechain/nodechain.module';
import { StateRecordingModule } from './state-recording/state-recording.module';
import { PotModule } from './pot/pot.module';
import { ArosCoinModule } from './aroscoin/aroscoin.module';
import { EmissionModule } from './emission/emission.module';
import { CommissionModule } from './commission/commission.module';
import { ReserveModule } from './reserve/reserve.module';
import { ReleaseModule } from './release/release.module';
import { NodesModule } from './nodes/nodes.module';
import { AllSeeingEyeModule } from './all-seeing-eye/all-seeing-eye.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
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
        CommonModule,
        NodeChainModule,
        StateRecordingModule,
        PotModule,
        ArosCoinModule,
        EmissionModule,
        CommissionModule,
        ReserveModule,
        ReleaseModule,
        NodesModule,
        AllSeeingEyeModule,
        OrchestratorModule,
    ],
    controllers: [AppController],
})
export class AppModule { }
