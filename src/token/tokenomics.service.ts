
import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ProcessingParams } from './tokenomics.interfaces';
import { ProcessReserveLedgerService } from '../proof_of_transaction_engine/process_reserve.service';

@Injectable()
export class TokenomicsService {
    private readonly logger = new Logger(TokenomicsService.name);

    constructor(
        private readonly processReserve: ProcessReserveLedgerService,
    ) {}

    private processingConfig = {
        alpha: 0.05,
        beta:  0.02,
        gamma: 100,
    };

    /**
     * Processing pool formula (unchanged — used for node reward budgeting).
     * TE = alpha * TV + beta * U + gamma
     */
    calculateProcessingPool(params: Omit<ProcessingParams, 'alpha' | 'beta' | 'gamma'>): number {
        const { transactionVolume, networkUtilization } = params;
        const { alpha, beta, gamma } = this.processingConfig;
        return Math.max(0, alpha * transactionVolume + beta * networkUtilization + gamma);
    }

    updateProcessingConfig(newConfig: Partial<typeof this.processingConfig>): void {
        this.processingConfig = { ...this.processingConfig, ...newConfig };
        this.logger.log('Processing configuration updated via Governance');
    }

    /**
     * Price is driven by the AFC reserve index from EmissionService.
     * Called externally; the price source of truth lives in EmissionService.
     * This method exists for compatibility with callers that expect it here.
     *
     * NOTE: For canonical price, prefer EmissionService.getCurrentEmissionPrice().
     */
    getCurrentPrice(): number {
        const state = this.processReserve.getReserveState();
        return state.reserveIndex;
    }

    /** @deprecated Use EmissionService.processTransactionEmission() for canonical flow. */
    updateInternalValuation(): void {
        // No-op: valuation is now driven by AFC reserve in EmissionService.
        // Kept for backward-compat with existing callers.
    }
}
