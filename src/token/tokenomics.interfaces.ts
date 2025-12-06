
export interface TokenPricingParams {
    utilizationIndex: number;
    fiatVolatility: number;
    alpha: number;
    beta: number;
    gamma: number;
}

export interface EmissionParams {
    transactionVolume: number;
    networkUtilization: number;
    alpha: number;
    beta: number;
    gamma: number;
}
