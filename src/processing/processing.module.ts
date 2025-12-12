import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionQueueItemEntity } from './transaction_queue_item.entity';
import { AuditLogEntity } from './audit_log.entity';

import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';
import { ProofService } from './proof.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([TransactionQueueItemEntity, AuditLogEntity]),
    ],
    controllers: [ProcessingController],
    providers: [ProofService, ProcessingService],
    exports: [ProofService, ProcessingService],
})
export class ProcessingModule { }
