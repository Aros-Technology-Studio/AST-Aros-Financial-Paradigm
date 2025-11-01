# API Reference: AST Public API Specification

This document provides the public-facing API specification for the AST (Aros Studio) Platform. This is the primary API used by end-user wallets, applications, and services to interact with the Nodechain.

This API provides core blockchain functionality, such as submitting transactions and querying network data.

---

## 1. Transaction Endpoints

Endpoints for creating, sending, and checking transactions.

### `POST /tx/submit`
Submits a new, signed transaction to the network. The transaction is sent to the `TX Queue Handler` (Module 07) for processing.

**Request Body:**
*(Based on `transaction.schema.json`)*
```json
{
  "txId": "0x...[SHA-256 hash of the payload]",
  "timestamp": "2025-11-01T22:30:00Z",
  "from": "ast-...[sender_address]",
  "to": "ast-...[recipient_address]",
  "amount": "150.000000000",
  "ttl": 300, // Time-to-live in seconds
  "signature": "0x...[sender's 64-byte signature]",
  "potWeight": 1, // Proof-of-Transaction weight
  "metadata": {}
}
````

**Response (Success 202):**
*A `202 Accepted` response indicates the transaction was successfully received by the node and is pending validation. It does NOT mean the transaction is finalized.*

```json
{
  "txId": "0x...[SHA-256 hash of the payload]",
  "status": "Pending",
  "receivedAt": "2025-11-01T22:30:01Z",
  "nodeId": "ast-node-uuid-..."
}
```

### `GET /tx/{txId}`

Retrieves the current status and details of a specific transaction by its hash.

**Response (Success 200):**

```json
{
  "transaction": {
    "txId": "0x...[SHA-256 hash]",
    "timestamp": "2025-11-01T22:30:00Z",
    "from": "ast-...[sender_address]",
    "to": "ast-...[recipient_address]",
    "amount": "150.000000000",
    ...
  },
  "status": "Finalized", // "Pending", "Finalized", "Failed"
  "blockId": 876543,
  "failureReason": null // Or e.g., "AI_FLAGGED_HIGH_RISK"
}
```

-----

## 2\. Account & Data Endpoints

Endpoints for querying public ledger data.

### `GET /account/{astAccountId}/balance`

Retrieves the current balance for a specific account.

**Response (Success 200):**

```json
{
  "astAccountId": "ast-...[address]",
  "balance": "10450.500000000", // 9 decimal precision string
  "locked": "500.000000000",
  "status": "Verified" // "Verified", "None", "Suspended"
}
```

### `GET /account/{astAccountId}/transactions`

Retrieves a paginated list of transactions for a specific account.

**Query Parameters:**

  * `?limit=50`
  * `?page=...` (pagination cursor)

**Response (Success 200):**

```json
{
  "astAccountId": "ast-...[address]",
  "transactions": [
    {
      "txId": "0x...[tx_hash_1]",
      "timestamp": "2025-11-01T22:30:00Z",
      "from": "ast-...[sender]",
      "to": "ast-...[recipient]",
      "amount": "150.000000000",
      "status": "Finalized"
    },
    {
      "txId": "0x...[tx_hash_2]",
      "timestamp": "2025-10-31T18:00:00Z",
      "from": "ast-...[other]",
      "to": "ast-...[this_account]",
      "amount": "5000.000000000",
      "status": "Finalized"
    }
  ],
  "nextPage": "cursor-for-next-page"
}
```

### `GET /network/epoch/current`

Retrieves the details of the current network epoch.

**Response (Success 200):**
*(Based on `epoch.schema.json`)*

```json
{
  "epochId": 1024,
  "startTime": "2025-11-01T20:00:00Z",
  "duration": 3600,
  "activeNodes": 150,
  "totalTransactions": 120540
}
```

```
```
