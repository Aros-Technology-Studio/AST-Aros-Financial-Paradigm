import { Block } from './block';
import { Node } from './node';

export class Chain {
    private blocks: Block[] = [];

    constructor(genesisData: Node[] = []) {
        const genesisBlock = new Block(
            0,
            '0'.repeat(64),
            Date.now(),
            genesisData,
        );
        this.blocks.push(genesisBlock);
    }

    public getBlocks(): readonly Block[] {
        return this.blocks;
    }

    public addBlock(nodes: Node[]): Block {
        const previousBlock = this.blocks[this.blocks.length - 1];
        const newBlock = new Block(
            previousBlock.index + 1,
            previousBlock.hash,
            Date.now(),
            nodes,
        );
        this.blocks.push(newBlock);
        return newBlock;
    }
}
