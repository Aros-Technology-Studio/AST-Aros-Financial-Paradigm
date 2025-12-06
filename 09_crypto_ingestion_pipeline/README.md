# Crypto Ingestion Pipeline

## Purpose
The Crypto Ingestion Pipeline enables AST to accept and validate external cryptocurrency flows (Bitcoin, Ethereum, etc.) without centralized custodians. It parses, validates, and normalizes external chain events into internal AST transactions for processing.

## Core Services & Components
- **Reference Nodes**: Read-only mirrors of external chains.
- **Parsing Agents**: Decoders for external transaction formats.
- **Normalization Engine**: Converts external data to specific internal schemas.
- **Multi-Chain Registry**: Maps external assets to internal representations.

## Key Specifications
- [External Crypto Ingestion](External%20Crypto%20Ingestion.md)
- [Crypto Normalization](crypto_tx_normalization.md)
- [Exit Pipeline](crypto_exit_pipeline.md)

## Responsible Team
- Crypto Ingestion Team
