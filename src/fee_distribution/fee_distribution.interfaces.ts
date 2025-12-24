export interface IEpochControl {
    startEpoch(epochNumber: number): Promise<void>;
    endEpoch(epochNumber: number): Promise<void>;
}

export interface IFeeDistributionTrigger {
    triggerMintingSequence(consensusEventId: string): Promise<void>;
}
