# API Reference: Module 12 - Nodechain AI Agents

This document provides the API specification for the **AI Supervisory Framework** (Module 12). This API is used by other AST system modules (like Module 07) and by external auditors/observers to query risk data and subscribe to alerts.

---

## 1. Risk Scoring (Internal API)

Endpoints used by internal systems (like the TX Validation Pipeline) to get real-time risk assessments.

### `POST /ai/score/transaction`
Calculates a real-time risk score for a new, pending transaction. This is a critical step in the validation pipeline (see `tx_validation_pipeline.md`).

**Request Body:**
*(A subset of `transaction.schema.json`)*
```json
{
  "txId": "0x...tx_hash_pending",
  "from": "ast-...",
  "to": "ast-...",
  "amount": "125000.750000000",
  "timestamp": "2025-11-01T21:09:59Z"
}
````

**Response (Success 200):**
*(Based on `risk_score.schema.json` and `anomaly_detection_engine.md`)*

```json
{
  "subject": "0x...tx_hash_pending",
  "score": 85, // 0-100 score. High score = High risk
  "source": "AI_AGENT",
  "reason": "Rapid succession of high-value transfers to new address.",
  "ts": "2025-11-01T21:10:00Z"
}
```

### `GET /ai/score/account/{astAccountId}`

Retrieves the current standing risk/reputation score for a given account. This is used by the `validator_behavior_monitor.md` and `Compliance Oracle`.

**Response (Success 200):**

```json
{
  "subject": "ast-...",
  "score": 22, // 0-100 score. Low score = Good standing
  "source": "AI_AGENT",
  "reason": "Long history of normal transaction patterns.",
  "ts": "2025-11-01T21:11:00Z"
}
```

-----

## 2\. Fraud & Audit (External/Audit API)

Endpoints used for real-time monitoring and auditing by regulators or supervisory nodes.

### `GET /ai/signals/subscribe` (WebSocket)

Establishes a WebSocket connection to receive real-time **Fraud Signals** as they are dispatched by the `fraud_signal_dispatcher.md`.

**Usage:** `wss://api.aros.studio/ai/signals/subscribe`

**Message (Server Push):**
*When a high-risk event (e.g., potential emergency) is detected:*

```json
{
  "signalId": "sig-uuid-...",
  "timestamp": "2025-11-01T21:15:00Z",
  "type": "EMERGENCY_HALT_RECOMMENDATION", // e.g., "HIGH_RISK_TX", "VALIDATOR_COLLUSION"
  "priority": "CRITICAL",
  "details": "AI Agent 'consensus_dispute_resolver' detected a potential shard fork on shard-a1b2c3d4.",
  "escalationStatus": "Sent to Governance [ADR-005]"
}
```

### `GET /ai/audit-trace`

Queries the immutable "meta-audit" log of the AI agents themselves (the `audit_trace_emitter.md`). This is used by regulators to audit the auditors.

**Query Parameters:**

  * `?subject=ast-...` (Filter by account, node, or tx)
  * `?time_start=...&time_end=...` (Filter by time range)

**Response (Success 200):**
*A list of immutable log entries, proving what the AI agents observed.*

```json
{
  "data": [
    {
      "logId": "meta-log-uuid-...",
      "timestamp": "2025-11-01T21:10:00Z",
      "agentId": "ai-anomaly-detector-01",
      "action": "SCORE_TRANSACTION",
      "subject": "0x...tx_hash_pending",
      "result": "Score: 85",
      "logHash": "0x...meta_log_hash"
    },
    {
      "logId": "meta-log-uuid-...",
      "timestamp": "2025-11-01T21:05:00Z",
      "agentId": "ai-validator-monitor-03",
      "action": "MONITOR_VOTE",
      "subject": "ast-node-uuid-...",
      "result": "Vote OK",
      "logHash": "0x...meta_log_hash"
    }
  ]
}
```

```
```
