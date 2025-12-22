export interface IEpochControl {
    startEpoch(epochNumber: number): Promise<void>;
    endEpoch(epochNumber: number): Promise<void>;
}

export interface IEmissionTrigger {
    triggerMintingSequence(consensusEventId: string): Promise<void>;
}
