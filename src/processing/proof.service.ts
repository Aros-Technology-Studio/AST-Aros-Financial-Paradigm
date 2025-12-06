import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class ProofService {
    /**
     * Generates Proof of Claim (PoC) hash.
     * PoC = Hash(TX_origin || KYC_ID || Timestamp || Signatures)
     */
    generatePoC(
        txOrigin: string,
        kycId: string,
        timestamp: number,
        signatures: string[],
    ): string {
        const data = `${txOrigin}:${kycId}:${timestamp}:${signatures.join(',')}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generates Deterministic Proof Hash (DPH) for audit trails.
     * DPH = Hash(TX_ID || Volume || Timestamp || Signatures...)
     */
    generateDPH(
        txId: string,
        volume: string,
        timestamp: number,
        signatures: string[],
    ): string {
        const data = `${txId}:${volume}:${timestamp}:${signatures.join(',')}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verifies if a PoC matches the provided data.
     */
    verifyPoC(
        pocHash: string,
        txOrigin: string,
        kycId: string,
        timestamp: number,
        signatures: string[],
    ): boolean {
        const recalculated = this.generatePoC(txOrigin, kycId, timestamp, signatures);
        return recalculated === pocHash;
    }
}
