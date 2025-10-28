# crypto_tx_normalization.md (1)

## 📄 `crypto_tx_normalization.md`

📂 Путь: `ast/processing_layer/crypto_ingestion_pipeline/crypto_tx_normalization.md`

---

```markdown
# Crypto Transaction Normalization

## 1. Purpose

This document defines how AST transforms externally ingested crypto transactions into its **standardized internal transaction format** — called `ARO_TX`.
Normalization is critical to ensure that heterogeneous blockchain inputs can be processed uniformly inside the AST system.

---

## 2. Why Normalization?

External blockchains differ in structure:

| Blockchain | TX Model     | Format         |
|------------|--------------|----------------|
| Bitcoin    | UTXO         | Binary/Hex     |
| Ethereum   | Account-based| JSON-RPC       |
| Monero     | ZK/Stealth   | Encrypted      |
| TON/BNB    | EVM variant  | Log/Event tree |

To unify them, AST implements a **normalization pipeline** that produces consistent, deterministic objects.

---

## 3. Internal Format: `ARO_TX`

### Format (JSON Schema)

```json
{
  "tx_id": "string",               // Internal hash ID
  "source_chain": "string",        // e.g. btc_livenet, eth_mainnet
  "sender": "string",              // Normalized address
  "receiver": "string",            // Normalized or mapped address
  "amount": "decimal",             // Base unit, pre-conversion
  "token_symbol": "string",        // e.g. ETH, BTC, USDT
  "token_type": "native|erc20|custom",
  "block_height": "integer",
  "timestamp": "ISO8601",
  "proof_hash": "string",          // Merkle or equivalent
  "raw_payload": "object"          // Original data for traceability
}

```

---

## 4. Normalization Rules

Each external chain follows a dedicated parser:

| Chain | Parser Module | Notes |
| --- | --- | --- |
| Bitcoin | `btc_utxo_normalizer` | Extracts input/output map |
| Ethereum | `evm_event_normalizer` | Reads logs, token transfers |
| TON | `evm_variant_parser` | Adapts EVM-compatible blocks |
| Monero/ZK | `zk_metadata_stub` | Limited, requires optional trust assumptions |

Parsed fields are mapped into `ARO_TX` using canonical internal standards — no foreign schema is preserved.

---

## 5. Conversion Strategy

- **All token values are left in raw units**, not yet converted to `ArosCoin` (see next document).
- **Address fields are re-mapped to AST-safe internal format** (address aliases may be assigned).
- **Source chain context is preserved** via `source_chain` and `proof_hash`.

---

## 6. Security

- **Immutable hash of raw_payload** is stored inside `ARO_TX`
- **Normalization cannot mutate economic meaning**
- **Rejected TXs** (malformed or unverifiable) are logged but never ingested

---

## 7. Summary

The normalization layer allows AST to take arbitrary crypto transaction inputs and re-express them in a fully internal, canonical format.

This enables all later processing, including conversion, routing, validation, and analytics.