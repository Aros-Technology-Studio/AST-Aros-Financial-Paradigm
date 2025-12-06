
import * as crypto from 'crypto';

/**
 * Interface representing a basic transaction structure.
 * Adjust fields based on actual Transaction entity if available.
 */
export interface Transaction {
    id: string;
    from: string;
    to: string;
    amount: number;
    signature: string;
    timestamp: number;
    payload?: any;
}

/**
 * Validates a transaction request by checking signature and basic integrity.
 * Note: Real signature verification would require public key recovery.
 * This is a placeholder for the logic described in Processing_Spec.md.
 * 
 * @param tx The transaction to validate
 * @returns true if valid, false otherwise
 */
export function validateRequest(tx: Transaction): boolean {
    if (!tx || !tx.id || !tx.from || !tx.signature) {
        console.error(`Validation Failed: Missing required fields for TX ${tx?.id}`);
        return false;
    }

    // TTL Check (example: 5 minute window for valid timestamps)
    const now = Date.now();
    const TX_TTL_MS = 5 * 60 * 1000;
    if (Math.abs(now - tx.timestamp) > TX_TTL_MS) {
        console.error(`Validation Failed: TX ${tx.id} timestamp out of bounds.`);
        return false;
    }

    // In a real scenario, we would verify the signature here using elliptic curve libs
    // e.g., secp256k1.verify(tx.signature, hashData(tx.payload), tx.fromPublic);

    // For now, we assume if signature is present and non-empty, it passes this basic check
    return true;
}

/**
 * Simulates the initiation of a rollback mechanism for a failed batch.
 * Logs the action as per Processing_Spec.md failure handling.
 * 
 * @param batchId The ID of the batch to rollback
 * @param reason The reason for rollback
 */
export function initiateRollback(batchId: string, reason: string = 'Consensus Failure'): void {
    console.warn(`[WARN] INITIATING ROLLBACK for BATCH: ${batchId}`);
    console.warn(`[WARN] Reason: ${reason}`);

    // Logic to release locks, revert balance changes would go here.
    // Ideally, this emits an event to the EventBus that the NodeChain listens to.

    console.log(`[INFO] Rollback signal sent for ${batchId}. Transactions returned to Queue.`);
}

/**
 * Generates a SHA-256 hash of the given data.
 * Useful for checking integrity or generating IDs.
 * 
 * @param data The data to hash (string or object)
 * @returns Hex string of the hash
 */
export function hashData(data: any): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(content).digest('hex');
}
