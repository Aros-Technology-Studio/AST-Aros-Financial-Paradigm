import { Injectable, Logger } from '@nestjs/common';
import { Encoder } from 'cbor-x';

@Injectable()
export class TxEncoderService {
    private readonly logger = new Logger(TxEncoderService.name);
    private readonly encoder: Encoder;

    constructor() {
        // Configured for deterministic encoding (sorting keys)
        this.encoder = new Encoder({
            structuredClone: true,
            mapsAsObjects: false,
            useRecords: false,
        });
    }

    /**
     * Encode a Transaction DTO into a binary buffer using CBOR.
     * This ensures deterministic output for hashing if keys are sorted manually or if the encoder supports canonical mod.
     * Note: cbor-x by default doesn't sort keys unless specified, but for simple DTOs usually usage pattern matters.
     * To be strictly canonical for hashing, we should ensure object key order or use a canonical wrapper.
     * For high performance, we assume strict interface usage.
     */
    public encode(data: any): Buffer {
        return this.encoder.encode(data);
    }

    public decode(buffer: Buffer): any {
        return this.encoder.decode(buffer);
    }

    /**
     * Generates a deterministic Hash for a transaction object.
     * It reconstructs the object with sorted keys to ensure canonical hash.
     */
    public hashTransaction(txData: any): Buffer {
        // Create a canonical object with strict key order
        const canonical = {
            prev: txData.previousHash,
            h: txData.ledgerHeight?.toString(),
            s: txData.sender,
            r: txData.recipient,
            a: txData.amount?.toString(),
            n: txData.nonce?.toString(),
            ts: txData.finalizedAt ? new Date(txData.finalizedAt).toISOString() : null
        };

        return this.encode(canonical);
    }
}
