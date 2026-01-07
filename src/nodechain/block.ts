import { Node } from './node';
import * as crypto from 'crypto';

export class Block {
    public readonly hash: string;
    constructor(
        public readonly index: number,
        public readonly previousHash: string,
        public readonly timestamp: number,
        public readonly nodes: Node[],
        public readonly nonce: number = 0,
    ) {
        this.hash = this.computeHash();
    }

    private computeHash(): string {
        const payload = `${this.index}${this.previousHash}${this.timestamp}${JSON.stringify(this.nodes)}${this.nonce}`;
        return crypto.createHash('sha256').update(payload).digest('hex');
    }
}
