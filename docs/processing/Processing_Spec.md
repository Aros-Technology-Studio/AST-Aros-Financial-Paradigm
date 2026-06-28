# AST: Transaction Processing Specification (Module 07)

This document provides the formal specification for the **Processing Layer (Module 07)**. This module is the "engine room" of the AST platform, responsible for handling all transactions from submission to finalization.

The process is a multi-stage, fault-tolerant pipeline.

## 1. Overview
The Processing Layer's job is to safely and efficiently validate, execute, and log every transaction. It receives raw, signed transactions from the `AST Public API` and moves them through a series of checkpoints before committing them to the `Nodechain (Module 02)` and logging them in the `Audit Trail (ADR-006)`.

## 2. The Transaction Lifecycle Pipeline
This flow is visualized in `docs/architecture/sequence_diagrams.md`.

### Step 1: Ingestion & Queuing
* **Component:** `TX Queue Handler` (`tx_queue_handler.md`)
* **Action:**
    1.  The Public API (`AST_API_Spec.md`) receives a new, signed transaction.
    2.  The transaction is immediately passed to the `TX Queue Handler`.
    3.  The handler performs a *basic* sanity check (e.g., "is it valid JSON?") and adds it to a high-throughput, persistent queue (e.g., Redis or Kafka).
    4.  A `202 Accepted` response is sent to the user.

### Step 2: The Validation Pipeline
* **Component:** `TX Validation Pipeline` (`tx_validation_pipeline.md`)
* **Action:** A worker pulls a transaction from the queue and subjects it to a series of strict, non-negotiable checks. **If any check fails, the transaction is REJECTED.**
    1.  **Schema Check:** Does it conform to `transaction.schema.json`?
    2.  **Signature Check:** Is the `signature` cryptographically valid for the `from` address?
    3.  **TTL Check:** Has the `ttl` (Time-to-Live) expired? (see `tx_ttl_expiration.md`).
    4.  **Funds Check:** Does the `from` address have sufficient balance? (Checks state).
    5.  **AI Risk Score Check:** The pipeline calls the `AI Agents API (Module 12)` to get a `RiskScore`. If the score is above the network threshold (e.g., > 90), the transaction is REJECTED as "AI-Flagged."

### Step 3: Batching & Dispatch
* **Component:** `TX Dispatch Engine` (`tx_dispatch_engine.md`)
* **Action:**
    1.  Validated, low-risk transactions are passed to the `Dispatch Engine`.
    2.  The engine groups transactions into a "batch" (see `tx_batching_and_sharding.md`).
    3.  The engine determines the correct `shardId` for the batch (see `ADR-004`).
    4.  The batch is formally proposed to the **Nodechain Consensus (Module 02)** for execution.

### Step 4: Finalization & Auditing
* **Component:** `TX Journal Writer` (`tx_journal_writer.md`)
* **Action:**
    1.  The **Consensus (Module 02)** notifies the `Dispatch Engine` that the batch was successfully committed and finalized.
    2.  The `Dispatch Engine` hands the finalized batch to the `TX Journal Writer`.
    3.  The `Journal Writer` writes the transaction data to all required **Audit Logs (ADR-006)**, including:
        * The `tx_audit_log_format.md` (for general TX history).
        * The `token_audit_trail.md` (for balance change history).
    4.  The transaction's status is updated to "Finalized" in the `TX Hash Map Index` (`tx_hash_map_index.md`) so users can query it.

## 3. Failure & Rollback
* **Component:** `TX Rollback Strategy` (`tx_rollback_strategy.md`)
* **Principle:** In the event of a consensus failure (Step 3) or a journaling failure (Step 4), the transaction batch is *not* lost.
* **Action:** The `Dispatch Engine` is responsible for safely re-queuing all transactions in a failed batch. This guarantees that no valid transaction is lost due to a temporary network or consensus fault.
