
import { Injectable, Logger } from '@nestjs/common';

export interface PaymentCalculationInput {
    validatorId: string;
    tasksValidated: number;
    performanceScore: number; // 0.0 to 1.0
    epochTotalWork: number;
    epochEmissionPool: number;
}

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);

    /**
     * Calculates the reward for a validator based on PROOF OF TRANSACTION logic.
     * 
     * COMPLIANCE RULE:
     * - Rewards are based on WORK (tasksValidated).
     * - Rewards are scaled by PERFORMANCE (performanceScore).
     * - Stake is NOT part of the reward formula (it is only an eligibility gate).
     */
    calculateReward(input: PaymentCalculationInput): number {
        const { validatorId, tasksValidated, performanceScore, epochTotalWork, epochEmissionPool } = input;

        if (epochTotalWork === 0) return 0;

        // 1. Calculate Work Share
        const workShare = tasksValidated / epochTotalWork;

        // 2. Apply Performance Factor
        // Score < 0.5 results in disproportionate penalty (slashing logic separation)
        const adjustedShare = workShare * performanceScore;

        // 3. Calculate Raw Reward
        const reward = epochEmissionPool * adjustedShare;

        this.logger.log(`Calculated reward for ${validatorId}: ${reward} (Work: ${tasksValidated}, Perf: ${performanceScore})`);

        return reward;
    }
}
