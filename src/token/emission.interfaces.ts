export interface EmissionResult {
  transactionAmount: number;
  emissionAmount: number;     // = transactionAmount (1:1)
  commission: number;         // = transactionAmount * commissionRate
  nodeShare: number;          // = commission * 0.75
  afcReserveShare: number;    // = commission * 0.25
  burnAmount: number;         // = emissionAmount (full burn — FEE_DISTRIBUTION entries are accounting-only)
  commissionRate: number;
  mintTxHash?: string;        // ledger hash of the MINT entry
}

export interface EmissionConfig {
  defaultCommissionRate: number; // e.g. 0.005 = 0.5%
  nodeShareRatio: number;        // 0.75
  afcReserveRatio: number;       // 0.25
}

export interface AfcReserveState {
  totalReserve: number;
  reserveIndex: number;          // grows as reserve accumulates
  transactionCount: number;
  lastUpdated: number;
}
