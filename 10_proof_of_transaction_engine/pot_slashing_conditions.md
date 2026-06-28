# PoT Deposit Forfeiture Conditions

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Defines conditions for slashing (penalizing) nodes in PoT for misbehavior in NodeChain.

## 2. Principles
- Proportional: Slash % based on severity.
- Automatic: Triggered by anomalies detected in NodeChain.

## 3. Conditions
- Invalid Attestation: 25% slash.
- No Response to Challenge: 50% slash.
- Repeated Failures (>3/epoch): 100% slash.

## 4. Formula
Slash Amount = stake * severity_factor (0.25-1.0)

## 5. Solidity Example
```solidity
function slash(address node, uint256 severity) public {
    uint256 stake = getStake(node);
    uint256 slashAmt = stake * severity / 100;
    burnStake(node, slashAmt);
    emit Slashed(node, slashAmt);
}
```

## 6. Dependencies
- 11_validator_staking_payments/slashing_and_penalty_rules.md (burn logic).
- 13_extra_supervisory_layer/anomaly_detection_patterns.md (triggers).

## 7. Notes
- Appeal: Via governance (06_governance_layer/).
