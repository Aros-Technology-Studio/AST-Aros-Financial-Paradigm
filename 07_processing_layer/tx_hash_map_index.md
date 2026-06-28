# tx_hash_map_index.md

## Module: Transaction Hash Map Index
- **Layer**: Processing Layer — AST (Aros Studio Tokenomics)
- **Status**: Production-grade
- **Author**: Aros Studio NodeChain Division
- **Last Updated**: 2025-07-05

---

## Overview

The `tx_hash_map_index` module provides a fast, in-memory and optionally persistent mapping between transaction identifiers (`tx_id`), preimage payload hashes, PoT (Proof of Transaction) hash anchors, and node chain linkage data. It serves as the central reference map for verifying transaction lineage, traceability, and chain-of-custody of token flows in AST.

This module supports real-time querying, validation of hash consistency, and reconstruction of event chains for audit or dispute resolution.

---

## Purpose

- Maintain bi-directional mapping between transaction ID and its cryptographic hashes
- Index PoT anchors for emission tracing
- Enable validators to verify cross-node hash consistency
- Support replay protection and double-spend defense
- Facilitate rapid lookup of transactions by hash or metadata

---

## Core Index Fields

| Field              | Description                                            |
|--------------------|--------------------------------------------------------|
| `tx_id`           | Unique transaction identifier                          |
| `hash_preimage`   | Hash of the transaction's input payload                |
| `pot_hash`        | Final PoT hash used for emission and validation        |
| `node_id`         | Node where the hash was originally computed            |
| `emission_epoch`  | Epoch during which this transaction was sealed         |
| `timestamp`       | Time of hash registration                              |
| `snapshot_id`     | Associated state snapshot used for validation          |
| `link_prev_hash`  | Optional reference to previous TX hash in NodeChain    |

---

## Sample Hash Index Entry

```json
{
  "tx_id": "TX-4513-ARC",
  "hash_preimage": "0x61f08c9a...",
  "pot_hash": "0x933abe87...",
  "node_id": "ND-11",
  "emission_epoch": 194,
  "timestamp": 1720250883,
  "snapshot_id": "SS-8921",
  "link_prev_hash": "0xa3bbd291..."
}

```

---

## Hash Mapping Logic

1. Transaction enters validation or dispatch
2. `hash_preimage` is generated based on canonical payload schema
3. If successful, and transaction is `emission_ready`, a PoT hash is computed
4. Entry is written to `tx_hash_map_index`
5. Entry is optionally linked to `link_prev_hash` if using NodeChain linear hash chaining

---

## Query Patterns

- `getByTxId(tx_id)`
- `getByPoTHash(pot_hash)`
- `getChainFrom(tx_id, depth=N)`
- `verifyPoT(tx_id) → boolean`
- `compareHashLineageAcrossNodes(tx_id, node_ids[])`

---

## Integrity and Synchronization

- Each hash entry is signed by the node where it was computed
- Full hash map can be checkpointed and snapshotted
- Mismatched hashes across nodes trigger synchronization protocol
- Hash entries are immutable once confirmed

---

## Integration Points

| Module | Purpose |
| --- | --- |
| `tx_journal_writer` | Supplies hash preimages and PoT outcomes |
| `PoT_Attestation_Engine` | Provides confirmed PoT hashes and validator references |
| `tx_audit_log_format` | Records hash mismatches or anomalies |
| `tx_state_snapshot_hook` | Associates validation snapshot for consistency checks |

---

## Developer Notes

- Hashes must follow canonical encoding format (e.g., keccak256 of sorted JSON fields)
- No duplicate `tx_id` or `pot_hash` values allowed — enforced by insertion layer
- Internal memory cache should be refreshed every epoch to avoid stale references
- Recommended to batch export hash index diffs for external notarization every 1000 TXs

---

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0 | 2025-07-05 | Initial hash map index structure |

---
