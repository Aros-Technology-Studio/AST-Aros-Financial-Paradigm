# AST Platform: Core Data Models

This document describes the primary data structures and entities used throughout the AST ecosystem. These models are formally defined as JSON Schemas in `docs/requirements/schemas/`.

These data models are the core "nouns" of the system.

## 1. `transaction.schema.json`
* **Purpose:** The canonical structure for a user-initiated transaction. This is the fundamental unit of work on the Nodechain.
* **Key Fields:**
    * `txId` (string): The SHA-256 hash of the core transaction payload.
    * `from` / `to` (string): The sender and recipient AST account addresses.
    * `amount` (string): The value to be transferred, represented as a string with 9 decimal places for precision (e.g., `"1000.000000000"`).
    * `signature` (string): The sender's 64-byte cryptographic signature, proving ownership.
    * `ttl` (integer): "Time-to-Live" in seconds. The transaction will be rejected by the queue if it is not processed within this time.
    * `potWeight` (integer): The weighting for the Proof-of-Transaction engine (Module 10).

## 2. `bridge_request.schema.json`
* **Purpose:** Represents a formal request to the `Bridge Layer (Module 05)` to move value between the fiat world and the AST platform.
* **Key Fields:**
    * `requestId` (string): A unique ID for this bridge operation.
    * `kind` (enum): The type of operation: `TOKENIZE` (fiat-to-crypto) or `REVERSE_TOKENIZE` (crypto-to-fiat).
    * `astAccountId` (string): The on-chain AST account.
    * `fiatAccountId` (string): The off-chain traditional bank account ID (e.g., IBAN).
    * `kycDecision` (boolean): The mandatory compliance check result (`true`/`false`) from the off-chain provider.
    * `signedByALB` (string): The cryptographic signature from the Aros Logic Bridge (ALB), proving the off-chain partner has validated this request.

## 3. `epoch.schema.json`
* **Purpose:** Defines the state of a single network epoch. Epochs are time-based cycles that control network-wide events, such as emission and validator payments.
* **Key Fields:**
    * `epochId` (integer): The sequential ID number of the epoch.
    * `startTime` / `duration` (string/integer): Defines the time-bound of the epoch.
    * `maxSupply` / `minted` (string): Strings representing the total supply cap and amount minted *during* this epoch.
    * `shards` (array): A list of active `shardId` strings for this epoch.

## 4. `risk_score.schema.json`
* **Purpose:** A standardized object returned by the `AI Agents (Module 12)` to provide a risk assessment.
* **Key Fields:**
    * `subject` (string): The entity being scored (e.g., a `txId`, `astAccountId`, or `nodeId`).
    * `score` (integer): A numerical score (0-100), where a higher number means higher risk.
    * `source` (enum): The module that generated the score (e.g., `AI_AGENT`, `ALB`).
    * `reason` (string): A human-readable justification for the score.

## 5. `audit_log_entry.schema.json`
* **Purpose:** The canonical structure for a single entry in the **Multi-Layered Audit Trail (ADR-006)**.
* **Key Fields:**
    * `eventId` (string): A unique ID for the log entry.
    * `actor` (string): The entity that performed the action (e.g., `"governance-module"`, `"user-uuid-..."`).
    * `action` (enum): The specific type of action performed (e.g., `MINT`, `BURN`, `LOCK`, `GOVERNANCE_VOTE`).
    * `ref` (string): A reference to the object of the action (e.g., the `txId` or `proposalId`).
