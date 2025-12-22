
import { Injectable, Logger } from '@nestjs/common';
import { hashData } from '../processing/processing.utils';
import { SmartContractIntegration } from '../integration/smart_contract.integration';

export interface TransactionMetadata {
    id: string;
    from: string;
    to: string;
    amount: number;
    timestamp: number;
    shardId?: string;
}

@Injectable()
export class Fee DistributionFraudPreventionService {
    private readonly logger = new Logger(Fee DistributionFraudPreventionService.name);

    constructor(private readonly smartContractIntegration: SmartContractIntegration) { }

    // In-memory store for demo purposes. In production, use Redis/DB.
    private processedTxHashes = new Set<string>();
    private recentTransactions: TransactionMetadata[] = [];

    /**
     * Checks a transaction for fraud before allowing emission trigger.
     * @param tx The transaction to check
     * @returns { isFraud: boolean, reason?: string }
     */
    async scanTransaction(tx: TransactionMetadata): Promise<{ isFraud: boolean; reason?: string }> {
        // 1. Replay Attack Check
        const txHash = hashData(tx.id + tx.from + tx.to + tx.amount + tx.timestamp);
        if (this.processedTxHashes.has(txHash)) {
            this.logger.warn(`Fraud Detected: Replay attack for TX ${tx.id}`);
            return { isFraud: true, reason: 'Replay Detected' };
        }

        // 2. Used Reference Check (Simulated)
        // In live system, this queries the Smart Contract usedReferences(bytes32)
        if (await this.checkReferenceUsage(tx.id)) {
            this.logger.warn(`Fraud Detected: Reference already used for TX ${tx.id}`);
            return { isFraud: true, reason: 'Double Issuance / Reference Used' };
        }

        // 3. PoT-Loop Fabrication (Circular Logic)
        // Simple check: A->B, B->A in short timeframe
        if (this.detectCircularPattern(tx)) {
            this.logger.warn(`Fraud Detected: Circular Loop logic for TX ${tx.id} (${tx.from} <-> ${tx.to})`);
            return { isFraud: true, reason: 'PoT-Loop Detected' };
        }

        // 4. Advanced Risk Scoring
        const riskScore = this.calculateRiskScore(tx);
        if (riskScore > 0.8) {
            this.logger.warn(`Fraud Detected: High Risk Score (${riskScore}) for TX ${tx.id}`);
            return { isFraud: true, reason: `High Risk Score: ${riskScore}` };
        }

        // No fraud found
        this.processedTxHashes.add(txHash);
        this.trackTransaction(tx);
        return { isFraud: false };
    }

    private trackTransaction(tx: TransactionMetadata) {
        this.recentTransactions.push(tx);
        // Keep window small for demo memory safety
        if (this.recentTransactions.length > 1000) {
            this.recentTransactions.shift();
        }
    }

    private detectCircularPattern(currentTx: TransactionMetadata): boolean {
        // Look for a recent transaction where 'to' was current 'from' and 'from' was current 'to'
        // i.e., B -> A, and now A -> B
        const timeWindow = 60 * 1000; // 1 minute
        const match = this.recentTransactions.find(t =>
            t.from === currentTx.to &&
            t.to === currentTx.from &&
            (currentTx.timestamp - t.timestamp) < timeWindow
        );
        return !!match;
    }

    /**
     * Checks if the reference ID has already been used in the contract.
     * @param refId 
     */
    private async checkReferenceUsage(refId: string): Promise<boolean> {
        return this.smartContractIntegration.isReferenceUsed(refId);
    }

    /**
     * Calculates a composite risk score between 0.0 and 1.0
     * @param tx 
     */
    private calculateRiskScore(tx: TransactionMetadata): number {
        let score = 0.0;

        // Example Heuristics:

        // 1. Large Amount Spill (if amount > 1M)
        if (tx.amount > 1_000_000) score += 0.3;

        // 2. New Account Behavior (simplified: if 'from' not seen in recent history)
        const isKnown = this.recentTransactions.some(t => t.from === tx.from);
        if (!isKnown) score += 0.1;

        // 3. Rapid frequency (if user sent another tx < 1s ago)
        const recentUserTx = this.recentTransactions.filter(t => t.from === tx.from && (tx.timestamp - t.timestamp) < 1000);
        if (recentUserTx.length > 2) score += 0.4;

        // 4. Velocity Check (Volume bursts)
        const oneMinAgo = tx.timestamp - 60000;
        const recentVolume = this.recentTransactions
            .filter(t => t.from === tx.from && t.timestamp > oneMinAgo)
            .reduce((sum, t) => sum + t.amount, 0);

        if (recentVolume > 5_000_000) {
            score += 0.5; // High velocity risk
        }

        return Math.min(score, 1.0);
    }
}
