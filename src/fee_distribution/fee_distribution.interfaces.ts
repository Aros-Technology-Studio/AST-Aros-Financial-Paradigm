export interface IEpochControl {
    startEpoch(epochNumber: number): Promise<void>;
    endEpoch(epochNumber: number): Promise<void>;
}

export interface IFee DistributionTrigger {
    triggerMintingSequence(consensusEventId: string): Promise<void>;
}
