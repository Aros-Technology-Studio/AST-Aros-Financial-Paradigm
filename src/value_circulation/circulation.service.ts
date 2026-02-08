import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TokenService } from '../token/token.service';

@Injectable()
export class CirculationService {
    private readonly logger = new Logger('ArosCoinVelocityTracker');

    constructor(
        @Inject(forwardRef(() => TokenService))
        private readonly tokenService: TokenService
    ) { }

    // In-memory stats for "Velocity of Money" tracking
    private circulationStats = {
        totalVolume24h: 0,
        txCount24h: 0,
        averageTxValue: 0,
        velocityScore: 0 // Aros Economic Metric
    };

    /**
     * Listens to confirmed transactions to update circulation metrics.
     * This fulfills the "Value Circulation" monitoring requirement.
     */
    @OnEvent('ledger.transaction.recorded')
    async handleTransaction(payload: any) {
        // payload: { hash, ledgerHeight, sender, nonce, amount }
        const amount = parseFloat(payload.amount || '0');

        this.circulationStats.txCount24h++;
        this.circulationStats.totalVolume24h += amount;

        // Calculate Velocity = Volume / Supply
        const supplyStats = await this.tokenService.getSupplyStats();
        const circulatingSupply = supplyStats ? parseFloat(supplyStats.circulatingSupply) : 1; // Avoid div by zero

        if (circulatingSupply > 0) {
            this.circulationStats.velocityScore = this.circulationStats.totalVolume24h / circulatingSupply;
        }

        this.logger.debug(`[VelocityTracker] Vol: ${this.circulationStats.totalVolume24h.toFixed(2)} | Velocity: ${this.circulationStats.velocityScore.toFixed(4)} | Supply: ${circulatingSupply}`);
    }

    public getCirculationMetrics() {
        return this.circulationStats;
    }

    /**
     * Simulation of Vault Policy
     */
    public checkReserveRatio() {
        // For AST, 1:1 ratio is fixed, but this checks if "Vaults" match "Supply".
        // Implementation placeholder.
        return { ratio: 1.0, status: 'OPTIMAL' };
    }
}
