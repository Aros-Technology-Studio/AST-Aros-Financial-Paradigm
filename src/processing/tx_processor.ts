import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service';

@Processor('nodechain_tx_queue')
export class TxBatchProcessor extends WorkerHost {
    private readonly logger = new Logger(TxBatchProcessor.name);

    constructor(private readonly ledgerService: LedgerService) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Processing TX Job: ${job.id}`);
        const txDto = job.data;

        // Process single transaction
        // Ideally we would batch them, but `process` is called per job in standard Worker mode.
        // To do batching, we would use a different pattern (pulling multiple jobs).
        // For this prototype, we process 1-by-1 but asynchronously from HTTP request.

        try {
            const result = await this.ledgerService.recordTransaction(txDto);
            return {
                txHash: result.hash,
                height: result.ledgerHeight,
                status: 'COMMITTED'
            };
        } catch (error) {
            this.logger.error(`Job ${job.id} failed: ${error.message}`);
            throw error; // Triggers retry
        }
    }
}
