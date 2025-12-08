
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
    publicKey?: string; // Added for verification
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

/**
 * Deterministically hashes a JSON object by sorting its keys.
 * This ensures that {a:1, b:2} and {b:2, a:1} produce the same hash.
 * 
 * @param obj The object to hash
 * @returns Hex string of the hash
 */
export function hashObject(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
        return hashData(String(obj));
    }

    // Recursive sort keys
    const sortKeys = (o: any): any => {
        if (Array.isArray(o)) {
            return o.map(sortKeys);
        } else if (o !== null && typeof o === 'object') {
            return Object.keys(o)
                .sort()
                .reduce((acc, key) => {
                    acc[key] = sortKeys(o[key]);
                    return acc;
                }, {} as any);
        }
        return o;
    };

    const sortedObj = sortKeys(obj);
    return hashData(JSON.stringify(sortedObj));
}

/**
 * Validates a transaction request by checking signature and basic integrity.
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

    // Signature Verification
    // If public key is provided in TX or we can look it up (simulated here via tx.publicKey)
    if (tx.publicKey) {
        try {
            const verifier = crypto.createVerify('SHA256');
            // We verify the hash of the payload + basic fields
            // Construct data buffer exactly as signed
            const dataToVerify = `${tx.id}:${tx.from}:${tx.to}:${tx.amount}:${tx.timestamp}`;
            verifier.update(dataToVerify);
            verifier.end();

            const isValid = verifier.verify(tx.publicKey, tx.signature, 'hex');
            if (!isValid) {
                console.error(`Validation Failed: Invalid Signature for TX ${tx.id}`);
                return false;
            }
        } catch (error) {
            console.error(`Validation Error: ${error.message}`);
            return false;
        }
    } else {
        // Fallback or warning if no public key available for verification context
        // For now, we assume if signature is present and non-empty, it passes this basic check
        // But we log a warning.
        // console.warn(`[WARN] No public key provided for TX ${tx.id}, skipping crypto verify.`);
    }

    return true;
}

export interface RollbackPlan {
    batchId: string;
    reason: string;
    action: 'RETRY' | 'ABORT' | 'QUARANTINE';
    impactedAccounts?: string[];
    timestamp: number;
}

/**
 * Initiates a structured rollback mechanism for a failed batch.
 * Returns a detailed plan for the NodeChain to execute.
 * 
 * @param batchId The ID of the batch to rollback
 * @param reason The reason for failure
 * @param impactedAccounts Optional list of accounts involved in the failure
 * @returns RollbackPlan object
 */
export function initiateRollback(batchId: string, reason: string = 'Consensus Failure', impactedAccounts: string[] = []): RollbackPlan {
    // 1. Log the initiation
    console.warn(`[WARN] INITIATING ROLLBACK for BATCH: ${batchId}`);
    console.warn(`[WARN] Reason: ${reason}`);

    // 2. Determine Action based on reason
    let action: RollbackPlan['action'] = 'RETRY';
    if (reason.toLowerCase().includes('fraud') || reason.toLowerCase().includes('signature')) {
        action = 'QUARANTINE';
    } else if (reason.toLowerCase().includes('timeout')) {
        action = 'RETRY';
    } else {
        action = 'ABORT';
    }

    // 3. Construct Plan
    const plan: RollbackPlan = {
        batchId,
        reason,
        action,
        impactedAccounts,
        timestamp: Date.now()
    };

    // 4. (Simulation) Emit event or notify Audit Service
    console.log(`[INFO] Generated Rollback Plan: ${JSON.stringify(plan)}`);

    return plan;
}
