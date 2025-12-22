
import { Injectable, Logger } from '@nestjs/common';

export interface PaymentCalculationInput {
    validatorId: string;
    tasksValidated: number;
    performanceScore: number; // 0.0 to 1.0
    epochTotalWork: number;
    epochPaymentPool: number;
}

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);

    /**
     * Calculates the payment for a validator based on PROOF OF TRANSACTION logic.
     * 
     * COMPLIANCE RULE:
     * - Payments are based on WORK (tasksValidated).
     * - Payments are scaled by PERFORMANCE (performanceScore).
     * - Stake is NOT part of the payment formula (it is only an eligibility gate).
     */
    calculatePayment(input: PaymentCalculationInput): number {
        const { validatorId, tasksValidated, performanceScore, epochTotalWork, epochPaymentPool } = input;

        if (epochTotalWork === 0) return 0;

        // 1. Calculate Work Share
        const workShare = tasksValidated / epochTotalWork;

        // 2. Apply Performance Factor
        // Score < 0.5 results in disproportionate penalty (slashing logic separation)
        const adjustedShare = workShare * performanceScore;

        // 3. Calculate Raw Payment
        const payment = epochPaymentPool * adjustedShare;

        this.logger.log(`Calculated payment for ${validatorId}: ${payment} (Work: ${tasksValidated}, Perf: ${performanceScore})`);

        return payment;
    }
}
