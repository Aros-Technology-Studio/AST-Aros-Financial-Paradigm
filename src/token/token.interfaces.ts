export interface IFeeDistributionLogic {
    calculateFeeDistribution(epochId: number, activityMetrics: any): number;
}

export interface ITokenMinting {
    mint(amount: number, recipient: string, reason: string): Promise<void>;
}

export interface ITokenBurning {
    burn(amount: number, from: string, reason: string): Promise<void>;
}
