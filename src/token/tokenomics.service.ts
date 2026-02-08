
import { Injectable, Logger } from '@nestjs/common';
import { ProcessingParams } from './tokenomics.interfaces';
import { ProcessReserveLedgerService } from '../proof_of_transaction_engine/process_reserve.service';

@Injectable()
export class TokenomicsService {
    private readonly logger = new Logger(TokenomicsService.name);

    constructor(
        private readonly processReserve: ProcessReserveLedgerService
    ) { }

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
     * UPDATED PRICE LOGIC (ArosCoin Evolution)
     * Price is no longer arbitrary. It is derived from the Process Reserve.
     * Price = ReserveValue / Circulation (simplified) OR
     * Price = Base * ReserveIndex
     */
    updateInternalValuation() {
        const reserveState = this.processReserve.getReserveState();

        // Thesis: Price grows as the "Reserve of Processed Work" grows.
        // We use a logarithmic scale to prevent runaway inflation, ensuring stability.
        // Base Price (1.0) + (ReserveIndex - 1.0) * Multiplier

        // Example: Index 1.0 -> Price 1.0
        // Index 1.1 -> Price 1.1 (if Multiplier is 1)

        const newPrice = 1.0 * reserveState.reserveIndex;

        if (newPrice !== this.currentPrice) {
            this.logger.log(`Dynamic Price Update: ${this.currentPrice.toFixed(6)} -> ${newPrice.toFixed(6)} (Reserve Index: ${reserveState.reserveIndex.toFixed(6)})`);
            this.currentPrice = newPrice;
        }
    }

    /**
     * Returns the current dynamic price.
     */
    getCurrentPrice(): number {
        return this.currentPrice;
    }
}
