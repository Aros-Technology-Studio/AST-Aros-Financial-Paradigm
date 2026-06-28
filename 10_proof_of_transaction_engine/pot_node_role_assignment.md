# PoT Node Role Assignment

**Module:** AST PoT Engine  
**Status:** Draft  
**Date:** 2025-08-24  

## 1. Purpose
Assigns roles (e.g., validator, attester) to nodes based on PoT weight and reputation within NodeChain.

## 2. Principles
- Merit-based: High-weight nodes get priority roles.
- Randomization: To prevent cartels in NodeChain.

## 3. Assignment Logic
1. Sort nodes by weight.
2. Apply randomness (hash-based from NodeChain epoch).
3. Assign: Top 30% validators, next 50% attesters.

## 4. Python Example
```python
import random
import hashlib


def assign_roles(nodes: list[dict]) -> dict:
    # Sort by weight descending
    sorted_nodes = sorted(nodes, key=lambda n: n['weight'], reverse=True)

    # Random seed from NodeChain epoch hash
    epoch_hash = hashlib.sha256(b'nodechain_epoch_data').hexdigest()
    random.seed(epoch_hash)

    roles = {}
    num_validators = int(len(sorted_nodes) * 0.3)
    for i, node in enumerate(sorted_nodes):
        if i < num_validators:
            roles[node['id']] = 'validator'
        else:
            roles[node['id']] = 'attester' if random.random() > 0.5 else 'observer'
    return roles
```

## 5. Dependencies
- 02_nodechain_engine/node_registration_and_auth.md (node list).
- 10_proof_of_transaction_engine/pot_tx_weighting_model.md (weights).

## 6. Notes
- Rotation: Every epoch to avoid dominance in NodeChain.
- Deposit Forfeiture: Reassign if slashed.
