import { Injectable, Logger } from '@nestjs/common';
import { validateRequest, initiateRollback } from './processing.utils';

@Injectable()
export class ProcessingService {
    private readonly logger = new Logger(ProcessingService.name);

    async validateTransaction(data: any): Promise<boolean> {
        // Wrapper for the utility function
        // In a real scenario, this might interact with DB or other services
        return validateRequest(data);
    }

    async triggerRollback(txHash: string, reason: string): Promise<any> {
        // Wrapper for cleanup/rollback logic
        return initiateRollback(txHash, reason);
    }
}
