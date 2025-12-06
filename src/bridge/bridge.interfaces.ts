export interface ITokenizationBridge {
    requestMint(externalTxHash: string, chain: string, amount: string): Promise<string>;
}

export interface IReverseTokenization {
    requestBurn(amount: string, targetChain: string, recipient: string): Promise<string>;
}

export interface IComplianceCheck {
    verifyIdentity(userId: string): Promise<boolean>;
    checkSanctions(address: string, chain: string): Promise<boolean>;
}
