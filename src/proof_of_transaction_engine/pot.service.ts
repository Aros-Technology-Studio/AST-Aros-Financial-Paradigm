import { Injectable, Logger } from '@nestjs/common';

export interface PoTWeightParams {
    txCount: number;
    totalFees: number;
    validations: number;
    penaltyScore: number;
}

@Injectable()
export class PoTService {
    private readonly logger = new Logger(PoTService.name);

    // Configuration for PoT Weight Formula
    // S_i = α·|TX_i| + β·F_i - δ·P_i
    private config = {
        alpha: 1.0,  // Weight for TX count
        beta: 2.0,   // Weight for Fees
        delta: 10.0  // Penalty multiplier
    };

    /**
     * Calculates the raw score (S_i) for a node based on its activity in an epoch.
     */
    calculateNodeScore(params: PoTWeightParams): number {
        const { txCount, totalFees, penaltyScore } = params;

        let score = (this.config.alpha * txCount) +
            (this.config.beta * totalFees) -
            (this.config.delta * penaltyScore);

        return Math.max(0, score); // Score cannot be negative
    }

    /**
     * Normalizes scores across all nodes to determine final weight.
     * weight_i = S_i / Σ S_j
     */
    calculateNormalizedWeights(nodeScores: Map<string, number>): Map<string, number> {
        let totalScore = 0;
        for (const score of nodeScores.values()) {
            totalScore += score;
        }

        const weights = new Map<string, number>();
        if (totalScore === 0) return weights;

        for (const [nodeId, score] of nodeScores.entries()) {
            weights.set(nodeId, score / totalScore);
        }

        return weights;
    }

    /**
     * Assigns roles based on weight percentile.
     * Top 30% -> Validators
     * Next 50% -> Attestators
     * Rest -> Observers
     */
    assignRoles(weights: Map<string, number>): Map<string, 'VALIDATOR' | 'ATTESTATOR' | 'OBSERVER'> {
        const sortedNodes = Array.from(weights.entries()).sort((a, b) => b[1] - a[1]);
        const totalNodes = sortedNodes.length;
        const roles = new Map<string, 'VALIDATOR' | 'ATTESTATOR' | 'OBSERVER'>();

        const validatorCount = Math.ceil(totalNodes * 0.3);
        const attestationCount = Math.ceil(totalNodes * 0.5);

        sortedNodes.forEach((node, index) => {
            if (index < validatorCount) {
                roles.set(node[0], 'VALIDATOR');
            } else if (index < validatorCount + attestationCount) {
                roles.set(node[0], 'ATTESTATOR');
            } else {
                roles.set(node[0], 'OBSERVER');
            }
        });

        return roles;
    }
}
