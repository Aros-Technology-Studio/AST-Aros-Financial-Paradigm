## 1. Compliance & Identity

Endpoints used to manage user identity and compliance status.

### `POST /kyc/submit`

Called by a 3rd-party KYC Provider (or partner bank) to submit the results of an off-chain identity check.

**Request Body:**

```json
{
  "userId": "user-uuid-...",       // Partner's internal user ID
  "astAccountId": "ast-...",     // User's on-chain AST address
  "kycDecision": "APPROVED",       // "APPROVED", "REJECTED", "REVIEW"
  "riskScore": 15,                 // 0-100 score from KYC provider
  "jurisdiction": "CH",            // ISO 3166-1 alpha-2 country code
  "providerSignature": "0x..."     // Signature from the KYC provider
}
````

**Response (Success 202):**
*A `202 Accepted` response indicates the data was received and is being processed by the Compliance Oracle.*

### `GET /kyc/status/{astAccountId}`

Checks the current on-chain compliance status of a specific AST account.

**Response (Success 200):**

```json
{
  "astAccountId": "ast-...",
  "status": "Verified", // "Verified", "Limited", "Suspended", "None"
  "complianceScore": 95,
  "lastVerified": "2025-10-30T10:00:00Z"
}
```

-----

## 2\. Value Flow (Tokenization)

Endpoints used to manage the "fiat-to-crypto" bridge.

### `POST /bridge/tokenize`

Initiates a request to tokenize fiat currency. This is called *after* a user has successfully passed KYC and the partner has confirmed receipt of fiat funds.

**Request Body:**
*(See `bridge_request.schema.json`)*

```json
{
  "reqId": "partner-tx-uuid-...",
  "kind": "TOKENIZE",
  "amount": "10000.000000000", // 9 decimal precision string (ArosCoin)
  "astAccountId": "ast-...",    // Target AST account
  "fiatTxId": "bank-ref-12345", // Reference to the off-chain fiat deposit
  "signedByPartner": "0x..."        // Signature from the Partner (bank's server)
}
```

**Response (Success 202):**
*A `202 Accepted` response. The partner must listen for an on-chain event (or use `/bridge/status`) for final confirmation.*

### `POST /bridge/reverse-tokenize`

Initiates a request to "burn" on-chain assets (e.g., ArosCoin) in exchange for fiat. This is the "crypto-to-fiat" exit.

**Request Body:**
*(See `bridge_request.schema.json`)*

```json
{
  "reqId": "partner-tx-uuid-...",
  "kind": "REVERSE_TOKENIZE",
  "amount": "500.000000000",   // Amount of ArosCoin to burn
  "astAccountId": "ast-...",    // Source AST account
  "fiatAccountId": "CH...bank-iban...", // Target fiat bank account
  "signedByPartner": "0x..."        // Signature from the Partner (bank's server)
}
```

**Response (Success 202):**
*A `202 Accepted` response. The user must first approve the "burn" transaction on-chain.*

### `GET /bridge/status/{reqId}`

Checks the status of a pending `TOKENIZE` or `REVERSE_TOKENIZE` request.

**Response (Success 200):**

```json
{
  "reqId": "partner-tx-uuid-...",
  "status": "PendingOnChainConfirmation", // "Pending", "PendingOnChainConfirmation", "Complete", "Failed"
  "onChainTxId": "0x...tx_hash..." // The final AST transaction hash
}
```

```
```
