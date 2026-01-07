import { Chain } from '../../../src/nodechain/chain';
import { Node } from '../../../src/nodechain/node';

describe('Chain', () => {
    it('should create genesis block and add subsequent blocks', () => {
        const genesisData: Node[] = [{ id: 'gen', data: 'genesis' }];
        const chain = new Chain(genesisData);
        const blocks = chain.getBlocks();
        expect(blocks.length).toBe(1);
        const newNodes: Node[] = [{ id: '2', data: 'second' }];
        const newBlock = chain.addBlock(newNodes);
        expect(chain.getBlocks().length).toBe(2);
        expect(newBlock.previousHash).toBe(blocks[0].hash);
    });
});
