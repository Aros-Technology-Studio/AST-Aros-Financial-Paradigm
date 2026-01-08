import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TxQueueService {
    private readonly logger = new Logger(TxQueueService.name);

    constructor(
        @InjectQueue('nodechain_tx_queue') private readonly txQueue: Queue
    ) { }

    async enqueueTransaction(txDto: any): Promise<{ jobId: string; status: string; timestamp: string }> {
        // Enqueue job with data
        const job = await this.txQueue.add('process_tx', txDto, {
            removeOnComplete: 1000, // Keep last 1000 completed jobs info
            removeOnFail: 5000,     // Keep error logs longer
            attempts: 3,            // Retry on transient failure
            backoff: 1000           // Wait 1s before retry
        });

        this.logger.debug(`Transaction enqueued. JobID: ${job.id}`);

        return {
            jobId: job.id,
            status: 'QUEUED',
            timestamp: new Date().toISOString()
        };
    }

    // Optional: method to check job status if needed later
}
