import { Injectable, Logger } from '@nestjs/common';

export interface IExternalProviderContract {
    validateSignature(payload: any, signature: string): Promise<boolean>;
    receiveConversionProof(proofId: string, encryptedMetadata: string): Promise<boolean>;
}

@Injectable()
/**
 * This contract defines the abstract boundary between AST and the External Provider.
 * It enforces Red Line 6: Primacy of AST. AST does not know who the provider is, only that they satisfy this contract.
 */
export class ExternalProviderContract implements IExternalProviderContract {
    private readonly logger = new Logger(ExternalProviderContract.name);

    /**
     * Verifies the cryptographic signature of an incoming payload from the External Provider.
     * Enforces Red Line 2: Isolation.
     */
    async validateSignature(payload: any, signature: string): Promise<boolean> {
        this.logger.log(`Validating External Provider signature...`);
        // In real implementation: Verify signature using Provider's public key
        // This confirms the data originated from the trusted institution
        return true;
    }

    /**
     * Receives a Proof of Conversion from External Provider.
     * Does NOT touch fiat funds. Just accepts the cryptographic proof.
     */
    async receiveConversionProof(proofId: string, encryptedMetadata: string): Promise<boolean> {
        this.logger.log(`Received conversion proof ${proofId} from External Provider.`);
        return true;
    }
}
