import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpochEntity } from './epoch.entity';
import { DistributionLogEntity } from './distribution_log.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([EpochEntity, DistributionLogEntity]),
    ],
    providers: [],
    exports: [],
})
export class FeeDistributionModule { }
