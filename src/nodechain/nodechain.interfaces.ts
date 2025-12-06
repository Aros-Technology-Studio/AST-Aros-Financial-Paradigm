export interface INodeRegistration {
    register(publicKey: string, proof: string): Promise<string>;
    deregister(nodeId: string): Promise<void>;
}

export interface IShardingStrategy {
    getShardForTransaction(txHash: string): number;
}

export interface IConsensusMechanism {
    proposeBlock(blockData: any): Promise<void>;
    validateBlock(blockHash: string, signature: string): Promise<boolean>;
}
