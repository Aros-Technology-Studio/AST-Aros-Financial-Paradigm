import { Injectable } from '@nestjs/common';

@Injectable()
export class NodeMetricsService {
    /**
     * Calculates Transactional Validator Score (TVS)
     * TVS = (Sum(1 + delta_t * S) for valid txs) * U
     * @param validTransactions Array of transactions processed
     * @param uptime Uptime coefficient (0.0 - 1.0)
     */
    calculateTVS(
        validTransactions: { latency: number; validSignature: boolean }[],
        uptime: number,
    ): number {
        const V = validTransactions.length;
        if (V === 0) return 0;

        let scoreSum = 0;
        for (const tx of validTransactions) {
            // Normalize latency (assuming lower is better, e.g., 1/latency or similar)
            const deltaT = 1 / (tx.latency + 0.1); // Avoid division by zero
            const S = tx.validSignature ? 1 : 0;
            scoreSum += 1 + deltaT * S;
        }

        return scoreSum * uptime;
    }

    /**
     * Calculates Node Reputation Index (NRI)
     * NRI = (1/n) * Sum(TVS_k * w_k)
     * @param history Array of historical TVS scores, newest first
     * @param decayFactor Decay factor for weights (e.g., 0.9)
     */
    calculateNRI(history: number[], decayFactor: number = 0.9): number {
        const n = history.length;
        if (n === 0) return 0;

        let weightedSum = 0;
        for (let k = 0; k < n; k++) {
            const weight = Math.pow(decayFactor, k);
            weightedSum += history[k] * weight;
        }

        return weightedSum / n;
    }
}
