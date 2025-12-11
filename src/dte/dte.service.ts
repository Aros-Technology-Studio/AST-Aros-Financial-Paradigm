import { Injectable, BadRequestException } from '@nestjs/common';
import { encode } from 'cbor-x';
import { sha3_512 } from 'js-sha3';

@Injectable()
export class DteService {

    /**
     * Validates the transaction structure against the AST Schema.
     * Currently implements basic field checks.
     */
    validateTransaction(tx: any): boolean {
        const requiredFields = ['sender', 'recipient', 'amount', 'asset', 'timestamp'];
        for (const field of requiredFields) {
            if (!tx[field]) {
                throw new BadRequestException(`Missing required field: ${field}`);
            }
        }
        return true;
    }

    /**
     * Encodes the transaction into a deterministic CBOR buffer.
     */
    encodeTransaction(tx: any): Buffer {
        // Sort keys to ensure determinism if the input is a plain object
        // cbor-x by default is reasonably deterministic but sorting keys manually is safer for "canonical" encoding
        const sortedTx = this.sortObjectKeys(tx);
        return Buffer.from(encode(sortedTx));
    }

    /**
     * Hashes the encoded transaction using SHA3-512.
     */
    hashTransaction(encoded: Buffer): string {
        return sha3_512(encoded);
    }

    private sortObjectKeys(obj: any): any {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(this.sortObjectKeys.bind(this));
        }
        return Object.keys(obj)
            .sort()
            .reduce((result, key) => {
                result[key] = this.sortObjectKeys(obj[key]);
                return result;
            }, {});
    }
}
