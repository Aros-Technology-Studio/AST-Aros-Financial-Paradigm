export interface ITxQueue {
    enqueue(txData: string, priority: number): Promise<string>;
    dequeue(): Promise<string | null>;
}

export interface ITxDispatcher {
    dispatchToContext(txId: string, contextId: string): Promise<void>;
}

export interface IValidationPipeline {
    validateStructure(rawTx: string): boolean;
    validateSignature(rawTx: string): boolean;
}
