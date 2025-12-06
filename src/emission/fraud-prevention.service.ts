
import { Injectable, Logger } from '@nestjs/common';
import { hashData } from '../processing/processing.utils';

export interface TransactionMetadata {
    id: string;
    from: string;
    to: string;
    amount: number;
    timestamp: number;
    shardId?: string;
}

@Injectable()
export class EmissionFraudPreventionService {
    private readonly logger = new Logger(EmissionFraudPreventionService.name);

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

        // 2. PoT-Loop Fabrication (Circular Logic)
        // Simple check: A->B, B->A in short timeframe
        if (this.detectCircularPattern(tx)) {
            this.logger.warn(`Fraud Detected: Circular Loop logic for TX ${tx.id} (${tx.from} <-> ${tx.to})`);
            return { isFraud: true, reason: 'PoT-Loop Detected' };
        }

        // 3. Shard Saturation (Too many small TXs to same shard from same user?)
        // Placeholder for complex shard logic.

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
}
