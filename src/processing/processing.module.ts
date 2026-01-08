import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TxQueueService } from './tx_queue.service';
import { TxBatchProcessor } from './tx_processor';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'nodechain_tx_queue',
        }),
        LedgerModule
    ],
    providers: [
        TxQueueService,
        TxBatchProcessor
    ],
    exports: [
        TxQueueService
    ]
})
export class ProcessingModule { }
