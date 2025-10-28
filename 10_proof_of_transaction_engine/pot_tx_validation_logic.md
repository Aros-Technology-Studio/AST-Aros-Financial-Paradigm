# PoT Transaction Validation Logic

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Defines the step-by-step logic for validating a transaction's validity in PoT, ensuring it meets activity, integrity, and contribution criteria before NodeChain consensus.

## 2. Principles
- **Activity Check**: TX must demonstrate real value (e.g., non-zero amount, valid sender).
- **Integrity Check**: No tampering (signatures, nonces).
- **Contribution Check**: Ties to ecosystem utility (e.g., fee payment), processed in NodeChain shards.

As Regulatory Strategist, validation includes AML flags for compliance.

## 3. Validation Steps
1. **Base Checks**: Verify format, nonce, timestamp (<5min drift).
2. **Signature Verification**: ECDSA check against sender public key.
3. **Contextual Integrity**: Cross-reference prev_tx_ref, ensure no double-spend in NodeChain.
4. **PoT-Specific**: Calculate behavioral score (uptime >95%, no recent slashes).
5. **Final Score**: If >80%, proceed to weighting.

## 4. Formula
Validity Score = (Activity Weight * 0.4) + (Integrity Weight * 0.4) + (Contribution Weight * 0.2)  
- Activity: amount / max_amount (normalized 0-1).  
- Integrity: 1 if signatures valid, 0 otherwise.  
- Contribution: fees_paid / avg_fees.

## 5. Python Example
```python
def validate_tx(tx: dict) -> float:
    # Step 1: Base checks
    if not tx.get('nonce') or not tx.get('timestamp'):
        return 0.0

    # Step 2: Signature (mock)
    if not verify_signature(tx['sender'], tx['hash'], tx['sig']):
        return 0.0

    # Step 3: Contextual (mock NodeChain check)
    if double_spend_check(tx['prev_ref']):
        return 0.0

    # Step 4: PoT behavioral in NodeChain
    node_uptime = get_node_uptime(tx['validator'])
    if node_uptime < 0.95:
        return 0.0

    # Step 5: Score
    activity = min(tx['amount'] / 1000, 1.0)  # Normalize
    integrity = 1.0  # Passed checks
    contribution = tx['fee'] / 0.05  # Relative to avg
    score = (activity * 0.4) + (integrity * 0.4) + (contribution * 0.2)
    return score
```

## 6. Dependencies
- 07_processing_layer/tx_structure_and_metadata.md (TX format).
- 02_nodechain_engine/encryption_protocol.md (signatures).

## 7. Notes
- Edge Case: Zero-amount TX (admin only, score 0.5 default).
- Feed score to All-Seeing Eye for anomalies, supporting GovTech audits.
