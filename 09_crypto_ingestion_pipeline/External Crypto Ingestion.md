# External Crypto Ingestion (1)

📂 Путь: `ast/processing_layer/crypto_ingestion_pipeline/external_crypto_ingestion.md`

---

```markdown
# External Crypto Ingestion

## 1. Purpose

This document defines how AST (Aros Studio Tokenomics) accepts, ingests, and validates external cryptocurrency flows.
It establishes the protocol for recognizing external blockchain transactions and securely mapping them into AST’s internal transaction pipeline — without relying on oracles, custodians, or trust-based bridges.

---

## 2. Ingestion Model Overview

AST does not directly control external blockchains. Instead, it recognizes their transaction flows using:

- **Reference nodes** (non-validating mirrors of public chains)
- **Deterministic parsing agents** (read-only)
- **Multi-chain mapping rules**, maintained in the `multi_chain_bridge_registry`

Each recognized transaction is:

1. Parsed from public chain
2. Identified via deterministic matching (no signatures or keys stored)
3. Routed into AST as a `raw_ingested_tx`

---

## 3. Supported Crypto Sources

The ingestion pipeline supports any externally verifiable chain, including:

| Chain Type     | Status           | Notes |
|----------------|------------------|-------|
| Bitcoin        | ✅ Supported     | via UTXO scanning |
| Ethereum (EVM) | ✅ Supported     | via log+event parse |
| Ton, BNB       | ✅ Supported     | native EVM-compatible bridge |
| XMR / ZK       | 🔄 Limited       | needs optional validation node |
| Others (custom)| 🧩 Extensible     | via registry injection |

---

## 4. Ingestion Steps

### Step 1: Detection
- External transaction is detected by the watcher agent.
- TX is hashed and pre-indexed with a `source_chain_id`.

### Step 2: Parsing
- Raw TX data is decoded (format-specific parser).
- Identity fields (`sender`, `value`, `token_contract`, etc.) extracted.

### Step 3: Validation
- Chain context is verified via snapshot hashes.
- Timestamp window and block finality are checked.

### Step 4: Packaging
- TX is converted into internal `ingested_tx` format (see `crypto_tx_normalization.md`)
- Metadata such as `origin_chain`, `proof_hash`, and `observed_block` is added.

### Step 5: Routing
- TX enters AST queue via `tx_queue_handler`, with tag `source=external_crypto`

---

## 5. Security Considerations

- **No keys or wallet control is required or stored**
- **Replays are blocked** by fingerprint+timestamp+block_hash validation
- **Sybil or injection attacks are mitigated** through chain snapshot matching
- **Audit trail** is written per ingestion event

---

## 6. Summary

This ingestion mechanism allows AST to natively process external crypto flows of any type.
It transforms decentralized blockchain events into deterministic, auditable entries inside AST — preparing them for conversion, priority routing, or internal execution.

```

---