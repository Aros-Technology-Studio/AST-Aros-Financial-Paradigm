# PoT Transaction Weighting Model

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Calculates the "weight" of a transaction in PoT, determining its validation priority and node payments within NodeChain.

## 2. Principles
- Weight reflects real contribution (activity + integrity).
- Dynamic: Adjusts based on NodeChain load.

## 3. Weight Components
- **Activity Weight**: TX value (amount + fee).
- **Integrity Weight**: Sender reputation (past TX success rate).
- **Context Weight**: NodeChain factors (e.g., shard density).

## 4. Formula
Weight = (Activity * 0.5) + (Integrity * 0.3) + (Context * 0.2)  
- Activity = log(amount + fee + 1) (to dampen large TX).  
- Integrity = 1 - (failures / total_tx) (capped at 1).  
- Context = 1 / (tx_per_shard / avg_tx_per_shard).

## 5. Solidity Example
```solidity
function calculateWeight(uint256 amount, uint256 fee, uint256 failures, uint256 totalTx, uint256 txPerShard, uint256 avgTxPerShard) public pure returns (uint256) {
    uint256 activity = log(amount + fee + 1);  // Mock log
    uint256 integrity = 1e18 - (failures * 1e18 / totalTx);  // Scaled
    uint256 context = 1e18 * avgTxPerShard / txPerShard;
    return (activity * 5 / 10) + (integrity * 3 / 10) + (context * 2 / 10);
}
```

## 6. Dependencies
- 08_emission_layer/epoch_allocation_model.md (epoch data).
- 11_validator_staking_payments/validator_performance_score.md (reputation).

## 7. Notes
- Tuning: Governance can adjust coefficients (06_governance_layer/).
- Test: Ensure weight >0.5 for valid TX in NodeChain.
