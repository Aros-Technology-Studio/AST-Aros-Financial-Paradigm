import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionQueueItemEntity } from './transaction_queue_item.entity';
import { AuditLogEntity } from './audit_log.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([TransactionQueueItemEntity, AuditLogEntity]),
    ],
    providers: [],
    exports: [],
})
export class ProcessingModule { }
