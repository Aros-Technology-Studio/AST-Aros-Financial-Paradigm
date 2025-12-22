import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenService {
    /**
     * returns the standard Exchange Rate.
     * Enforces Thesis 3: No Speculation.
     * The rate is determined 1:1 by ALB entrance/exit.
     */
    getExchangeRate(): number {
        return 1.0;
    }

    /**
     * Calculates emission volume based on transaction volume and network load.
     * TE = alpha * TV + beta * U + gamma
     * @param transactionVolume Total value of transactions
     * @param utilization Network utilization
     * @param params Inflation control parameters
     */
    calculateEmissionVolume(
        transactionVolume: number,
        utilization: number,
        params: { alpha: number; beta: number; gamma: number } = { alpha: 0.01, beta: 0.05, gamma: 0 },
    ): number {
        const { alpha, beta, gamma } = params;
        // NOTE: Emission is strictly coupled to Transaction Volume (fee recycling), NOT inflation.
        return Math.max(0, alpha * transactionVolume + beta * utilization + gamma);
    }

    /**
     * Calculates payment for a specific node based on NRI.
     * Ti = (NRIi / TotalNRI) * TotalPaymentPool
     * @param nodeNRI Reputation score of the node
     * @param totalNRI Sum of all eligible node NRIs
     * @param totalPaymentPool Total tokens to distribute
     */
    calculateNodePayment(
        nodeNRI: number,
        totalNRI: number,
        totalPaymentPool: number,
    ): number {
        if (totalNRI === 0) return 0;
        return (nodeNRI / totalNRI) * totalPaymentPool;
    }
}
