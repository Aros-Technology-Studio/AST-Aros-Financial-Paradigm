import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpochEntity } from './epoch.entity';
import { EmissionLogEntity } from './emission_log.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([EpochEntity, EmissionLogEntity]),
    ],
    providers: [],
    exports: [],
})
export class EmissionModule { }
