import { Block } from '../../../src/nodechain/block';
import { Node } from '../../../src/nodechain/node';

describe('Block', () => {
    it('should compute correct hash', () => {
        const nodes: Node[] = [{ id: '1', data: 'test' }];
        const block = new Block(0, '0'.repeat(64), 0, nodes);
        const expectedPayload = `0${'0'.repeat(64)}0${JSON.stringify(nodes)}0`;
        const crypto = require('crypto');
        const expectedHash = crypto.createHash('sha256').update(expectedPayload).digest('hex');
        expect(block.hash).toBe(expectedHash);
    });
});
