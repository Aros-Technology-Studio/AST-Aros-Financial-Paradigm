# PoT Transaction Signature Model

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Defines the multi-signature model for PoT TX attestation, ensuring consensus in NodeChain.

## 2. Principles
- Multi-Sig: Quorum (67%) required.
- Cryptographic: ECDSA with NodeChain node keys.

## 3. Signature Flow
1. Node signs hash(TX + weight).
2. Aggregate signatures in NodeChain shard.
3. Verify quorum.

## 4. Solidity Example
```solidity
function verifyMultiSig(bytes32 txHash, bytes[] memory signatures, address[] memory signers) public pure returns (bool) {
    uint quorum = signers.length * 67 / 100;
    uint valid = 0;
    for (uint i = 0; i < signatures.length; i++) {
        if (recoverSigner(txHash, signatures[i]) == signers[i]) {
            valid++;
        }
    }
    return valid >= quorum;
}
```

## 5. Dependencies
- 02_nodechain_engine/encryption_protocol.md (keys).
- 06_governance_layer/quorum_validation_rules.md (threshold).

## 6. Notes
- Timeout: Unsigned after TTL slashed in NodeChain.
