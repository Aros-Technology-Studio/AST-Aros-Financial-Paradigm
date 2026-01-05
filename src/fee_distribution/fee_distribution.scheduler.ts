import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeeDistributionService } from './fee_distribution.service';

@Injectable()
export class FeeDistributionScheduler {
    private readonly logger = new Logger(FeeDistributionScheduler.name);

    constructor(private readonly feeDistributionService: FeeDistributionService) { }

    /**
     * Runs every hour to process fee distribution.
     * Adjust CronExpression as needed for production (e.g., EVERY_DAY, EVERY_10_MINUTES).
     */
    @Cron(CronExpression.EVERY_HOUR)
    async handleCron() {
        this.logger.log('--- Triggering Scheduled Fee Distribution ---');

        // This logic is a simplified simulation. 
        // In a real system, we need to know WHICH epoch to finalize (the one ending now)
        // and which to start (the next one).
        // Since the Service handles finding active epochs, we can just call 'finalize' on the *current* active?
        // or we maintain a counter. 

        // For this prototype, we will:
        // 1. Get current active epoch number (we'd need a getter, or just try to start a new one based on time)
        // Let's assume epoch number is roughly (Hours since Genesis)

        // BETTER APPROACH for Prototype:
        // Use a persistent counter or check DB for max epoch number.
        // We will implement `startNewEpoch` based on `lastEpoch + 1`.

        try {
            // Find what the last epoch was or is
            // We need a helper in service or we just guess. 
            // Let's add `getCurrentEpoch()` to service or logic here.
            // But to keep it simple and stateless here, let's call a method `rotateEpoch()` on service?
            // Since `rotateEpoch` doesn't exist, I will implement logic here or add helper.

            // Let's try to finalize WHATEVER is active.
            // But finalize requires an ID.

            // Refactor: We should add `rotateEpoch()` to FeeDistributionService to contain this logic cleanly.
            // But since I can't change Service interface easily without tools, I'll do this:

            // "Hack" for prototype:
            // We actually don't know the current epoch number easily without querying.
            // I will assume the Service has a way to "Check and Rotate".
            // Since it doesn't, let's just log for now, OR better:
            // Query repo? I don't have repo access here.

            // I will modify FeeDistributionService to generic `rotateEpoch`? 
            // No, the task was just "Scheduler".

            // Let's try to fetch the last active one.
            // But I don't want to inject Repos here if possible, keeping it clean.

            // I will add `triggerEpochCycle()` to FeeDistributionService. 
            // That is cleaner.

            await this.feeDistributionService.triggerEpochCycle();

        } catch (error) {
            this.logger.error('Failed to execute fee distribution cron', error.stack);
        }
    }
}
