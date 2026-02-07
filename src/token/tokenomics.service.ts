
import { Injectable, Logger } from '@nestjs/common';
import { ProcessingParams } from './tokenomics.interfaces';

@Injectable()
export class TokenomicsService {
    private readonly logger = new Logger(TokenomicsService.name);

    // Default tuning parameters (can be updated by Governance)
    private processingConfig = {
        alpha: 0.05, // 5% of TV
        beta: 0.02,  // 2% of Utilization
        gamma: 100   // Base processing fee
    };

    /**
     * Calculates processing pool based on transaction volume and network load.
     * TE = alpha * TV + beta * U + gamma
     * // Strictly fixed 1:1 asset-backed distribution as per Thesis 3
     */
    // Dynamic Price State (In-Memory for Prototype, should be DB-persisted)
    private currentPrice = 1.0;

    // Growth Factor: Price increases by this amount per transaction processed
    private readonly GROWTH_FACTOR = 0.000001;

    /**
     * Calculates processing pool based on transaction volume and network load.
     * TE = alpha * TV + beta * U + gamma
     * // Strictly fixed 1:1 asset-backed distribution as per Thesis 3
     */
    calculateProcessingPool(params: Omit<ProcessingParams, 'alpha' | 'beta' | 'gamma'>): number {
        const { transactionVolume, networkUtilization } = params;
        const config = this.processingConfig;

        // NOTE: Pool is strictly coupled to Transaction Volume (fee recycling), NOT new token emission.
        const processingPool = (config.alpha * transactionVolume) +
            (config.beta * networkUtilization) +
            config.gamma;

        return Math.max(0, processingPool);
    }

    /**
     * Updates governance parameters.
     */
    updateProcessingConfig(newConfig: Partial<typeof this.processingConfig>) {
        this.processingConfig = { ...this.processingConfig, ...newConfig };
        this.logger.log('Processing configuration updated via Governance');
    }

    /**
     * INCREMENT PRICE LOGIC
     * Called after every successful transaction batch or significant event.
     * Simulates "Capital Accumulation" by raising the floor price.
     */
    incrementPrice(txCount: number = 1) {
        const oldPrice = this.currentPrice;
        this.currentPrice = oldPrice + (this.GROWTH_FACTOR * txCount);
        this.logger.log(`Dynamic Price Update: ${oldPrice.toFixed(6)} -> ${this.currentPrice.toFixed(6)} (TXs: ${txCount})`);
    }

    /**
     * Returns the current dynamic price.
     */
    getCurrentPrice(): number {
        return this.currentPrice;
    }
}
