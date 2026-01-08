import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaEventEntity } from './entities/meta_event.entity';
import { MetaLogService } from './meta_log.service';
import { AnomalyDetectionService } from './anomaly_detection.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([MetaEventEntity])
    ],
    providers: [
        MetaLogService,
        AnomalyDetectionService
    ],
    exports: [
        MetaLogService,
        AnomalyDetectionService
    ]
})
export class SupervisoryModule { }
