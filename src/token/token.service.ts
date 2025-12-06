import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenService {
    /**
     * Calculates dynamic token price based on utilization and volatility.
     * P = alpha * log(Utilization) + beta * FX_vol + gamma
     * @param utilizationIndex Network/Token utilization index (0.1 to infinity)
     * @param fxVolatility Volatility of underlying assets
     * @param params Configuration parameters (alpha, beta, gamma)
     */
    calculateTokenPrice(
        utilizationIndex: number,
        fxVolatility: number,
        params: { alpha: number; beta: number; gamma: number } = { alpha: 1, beta: 1, gamma: 0 },
    ): number {
        // Avoid log(0) or negative inputs
        const u = Math.max(utilizationIndex, 0.000001);
        const { alpha, beta, gamma } = params;

        return alpha * Math.log(u) + beta * fxVolatility + gamma;
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

        // Ensure emission implies positive growth or zero, depending on policy
        return Math.max(0, alpha * transactionVolume + beta * utilization + gamma);
    }

    /**
     * Calculates reward for a specific node based on NRI.
     * Ti = (NRIi / TotalNRI) * TotalEmission
     * @param nodeNRI Reputation score of the node
     * @param totalNRI Sum of all eligible node NRIs
     * @param totalEmission Total tokens to distribute
     */
    calculateNodeReward(
        nodeNRI: number,
        totalNRI: number,
        totalEmission: number,
    ): number {
        if (totalNRI === 0) return 0;
        return (nodeNRI / totalNRI) * totalEmission;
    }
}
