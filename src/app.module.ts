import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TokenManagementModule } from './modules/token-management/token-management.module';
import { BridgeModule } from './modules/bridge/bridge.module';
import { NodechainModule } from './modules/nodechain-integration/nodechain.module';


// Placeholder for feature modules
// import { TokenManagementModule } from './modules/token-management/token-management.module';

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
        TokenManagementModule,
        BridgeModule,
        NodechainModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }
