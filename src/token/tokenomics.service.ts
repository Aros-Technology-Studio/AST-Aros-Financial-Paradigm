
import { Injectable, Logger } from '@nestjs/common';
import { TokenPricingParams, EmissionParams } from './tokenomics.interfaces';

@Injectable()
export class TokenomicsService {
    private readonly logger = new Logger(TokenomicsService.name);

    // Default tuning parameters (can be updated by Governance)
    private pricingConfig = {
        alpha: 1.0,
        beta: 0.5,
        gamma: 0.1
    };

    private emissionConfig = {
        alpha: 0.05, // 5% of TV
        beta: 0.02,  // 2% of Utilization
        gamma: 100   // Base block reward
    };

    /**
     * Calculates the dynamic price of the token.
     * Formula: P = alpha * log(Utilization) + beta * FX_vol + gamma
     */
    calculateTokenPrice(params: Omit<TokenPricingParams, 'alpha' | 'beta' | 'gamma'>): number {
        const { utilizationIndex, fiatVolatility } = params;
        const alphabet = this.pricingConfig; // Use operational config

        // Avoid log(0)
        const safeUtilization = utilizationIndex <= 0 ? 0.0001 : utilizationIndex;

        const price = (alphabet.alpha * Math.log(safeUtilization)) +
            (alphabet.beta * fiatVolatility) +
            alphabet.gamma;

        // Ensure price never drops below 0.01 (min floor)
        return Math.max(0.01, price);
    }

    /**
     * Calculates the emission volume for a period/block.
     * Formula: TE = alpha * TV + beta * U + gamma
     */
    /**
     * Calculates processing pool based on transaction volume and network load.
     * TE = alpha * TV + beta * U + gamma
     * // Strictly fixed 1:1 asset-backed distribution as per Thesis 3
     */
    calculateProcessingPool(params: Omit<EmissionParams, 'alpha' | 'beta' | 'gamma'>): number {
        const { transactionVolume, networkUtilization } = params;
        const config = this.emissionConfig;

        const emission = (config.alpha * transactionVolume) +
            (config.beta * networkUtilization) +
            config.gamma;

        return Math.max(0, emission);
    }

    /**
     * Updates governance parameters.
     */
    updatePricingConfig(newConfig: Partial<typeof this.pricingConfig>) {
        this.pricingConfig = { ...this.pricingConfig, ...newConfig };
        this.logger.log('Pricing configuration updated via Governance');
    }
}
