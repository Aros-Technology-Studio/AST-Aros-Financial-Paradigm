# API Reference: Module 02 - Nodechain Engine

This document provides the core API specification for interacting with the AST Nodechain Engine (Module 02). This API is primarily used by nodes (Validators, Shards, Observers) for registration, consensus, and network operations.

The API is assumed to be a gRPC/RPC interface.

---

## 1. Node Lifecycle & Authentication

Based on: `node_registration_and_auth.md`

These endpoints manage the lifecycle of a node wishing to join the AST network.

### `POST /node/register`
Registers a new node with the network. This is the first step in the "cryptographic onboarding" process.

**Request Body:**
```json
{
  "nodeType": "Validator", // "Validator", "Shard", "Observer"
  "publicKey": "0x...",    // The node's main public key
  "identityAttestation": "...", // A signed attestation (e.g., from Governance)
  "shardId": "shard-a1b2c3d4" // Optional: requested shard assignment
}
````

**Response (Success 200):**

```json
{
  "nodeId": "ast-node-uuid-...",
  "status": "PendingAttestation",
  "challenge": "0x..." // A cryptographic challenge to be signed
}
```

### `POST /node/auth`

Completes the authentication handshake by responding to the server's challenge.

**Request Body:**

```json
{
  "nodeId": "ast-node-uuid-...",
  "challengeResponse": "0x..." // The challenge, signed by the node's private key
}
```

**Response (Success 200):**

```json
{
  "nodeId": "ast-node-uuid-...",
  "status": "Active",
  "authToken": "jwt-or-paseto-token-..." // A session token for subsequent requests
}
```

-----

## 2\. Consensus & Validation

Based on: `shard_quorum_protocol.md`, `shard_signature_model.md`

Endpoints used by active nodes to participate in consensus.

### `GET /consensus/epoch/current`

Fetches the current state of the network epoch.

**Response (Success 200):**
*(See `epoch.schema.json`)*

```json
{
  "epochId": 1024,
  "startTime": "2025-11-01T20:00:00Z",
  "duration": 3600,
  "maxSupply": "1000000000.000000000",
  "minted": "12000.000000000",
  "shards": ["shard-a1b2c3d4", "shard-e5f6a7b8"]
}
```

### `GET /consensus/batch/next`

Used by a Validator node to request the next batch of transactions that requires validation.

**Response (Success 200):**

```json
{
  "batchId": "batch-uuid-...",
  "shardId": "shard-a1b2c3d4",
  "transactionIds": [
    "0x...tx_hash_1",
    "0x...tx_hash_2"
  ]
}
```

### `POST /consensus/vote`

Submits a Validator's signed vote on a proposed transaction batch. This is the core of the "Shard Signature Model."

**Headers:**

  * `Authorization: Bearer <authToken>`

**Request Body:**

```json
{
  "batchId": "batch-uuid-...",
  "vote": "Approve", // "Approve" or "Reject"
  "nodeSignature": "0x..." // Node's signature over the batchId + vote
}
```

**Response (Success 202):**
*A `202 Accepted` response indicates the vote was received and will be tallied.*

-----

## 3\. Network & Status

### `GET /network/status`

Returns the high-level health and status of the entire AST Nodechain.

**Response (Success 200):**

```json
{
  "status": "Operational",
  "currentEpoch": 1024,
  "activeNodes": 150,
  "tps_5min_avg": 874.5,
  "consensusHealth": "Healthy", // "Healthy", "Degraded", "Halted"
  "lastFinalizedBlock": 987654
}
```

### `GET /node/status`

Used by a node operator to check the status of their own node.

**Headers:**

  * `Authorization: Bearer <authToken>`

**Response (Success 200):**

```json
{
  "nodeId": "ast-node-uuid-...",
  "status": "Active",
  "shardId": "shard-a1b2c3d4",
  "uptime_percent_24h": 99.98,
  "reputationScore": 95,
  "blocksProposed": 120,
  "votesMissed": 2
}
```

```
```
