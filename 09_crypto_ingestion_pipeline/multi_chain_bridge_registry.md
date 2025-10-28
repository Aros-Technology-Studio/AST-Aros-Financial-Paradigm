# multi_chain_bridge_registry.md (1)

## 📄 `multi_chain_bridge_registry.md`

📂 Путь: `ast/processing_layer/crypto_ingestion_pipeline/multi_chain_bridge_registry.md`

---

```markdown
# Multi-Chain Bridge Registry

## 1. Purpose

This document defines the structure and operational role of the **Multi-Chain Bridge Registry** — a core component of AST’s crypto ingestion pipeline.
It maps external blockchain systems (Bitcoin, Ethereum, etc.) to internal ingestion logic, and maintains deterministic metadata used for parsing, validation, and routing.

---

## 2. Registry Function

The registry acts as a **read-only, deterministic lookup table** for:

- Protocol parsing logic (EVM, UTXO, etc.)
- Field extraction rules per chain
- Accepted contract/event patterns
- Observability parameters (finality thresholds, drift tolerance)
- Conversion multipliers (for crypto → ARO standardization)

This registry is stored internally in AST and updated only through governance procedures.

---

## 3. Registry Schema

Each entry in the registry includes:

| Field                | Type        | Description |
|---------------------|-------------|-------------|
| `chain_id`           | `String`    | Internal ID for the chain (e.g. `eth_mainnet`, `btc_livenet`) |
| `protocol_type`      | `Enum`      | `EVM`, `UTXO`, `ZK`, `Custom` |
| `finality_depth`     | `Int`       | Number of confirmations required before ingest |
| `parser_module`      | `String`    | Name of the internal AST parser module to apply |
| `conversion_rate`    | `Decimal`   | Crypto-to-ARO multiplier |
| `event_filters`      | `Array`     | Relevant topics or contracts to observe |
| `enabled`            | `Boolean`   | Chain status |

---

## 4. Example Entries

```json
[
  {
    "chain_id": "eth_mainnet",
    "protocol_type": "EVM",
    "finality_depth": 12,
    "parser_module": "evm_log_parser_v1",
    "conversion_rate": 1.0000,
    "event_filters": ["Transfer(address,address,uint256)"],
    "enabled": true
  },
  {
    "chain_id": "btc_livenet",
    "protocol_type": "UTXO",
    "finality_depth": 6,
    "parser_module": "btc_utxo_reader",
    "conversion_rate": 1.0000,
    "event_filters": [],
    "enabled": true
  }
]

```

---

## 5. Governance and Updates

- Registry entries can only be created, modified, or disabled via **internal governance voting**
- AST nodes pull snapshot of registry at startup; runtime updates are gated by quorum
- Conflicts between registry and parser modules are flagged and logged during ingestion

---

## 6. Security Rules

- Only **whitelisted chains** are allowed for ingestion
- All `conversion_rate` values must be audited and checkpointed
- Duplicate or ambiguous `event_filters` are rejected at load-time

---

## 7. Summary

The Multi-Chain Bridge Registry provides AST with a structured, deterministic way to ingest, parse, and convert crypto flows from heterogeneous chains — without requiring external bridge control or mutable runtime logic.