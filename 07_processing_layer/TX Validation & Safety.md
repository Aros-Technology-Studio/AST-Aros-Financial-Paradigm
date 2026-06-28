# TX Validation & Safety 

## 1. Purpose

This document defines how the AST system performs **transaction batching** and **sharding** within the internal processing engine.
These mechanisms are designed to improve throughput, enable horizontal scaling, and reduce contention during peak transaction load.

---

## 2. What is Batching?

Batching is the process of grouping multiple transactions together into a single **execution bundle**, enabling:

- Reduced I/O and state commitment cost
- Pipelined execution
- Shared gas accounting (optional per mode)
- Parallel dispatch to sharded contexts

---

## 3. Batch Formation Rules

Transactions are batched according to:

- Channel affinity (e.g., governance, contracts, token ops)
- Shared source or execution scope
- TTL alignment (must expire in similar time frames)
- Isolation compatibility (no conflicting locks or assets)

Example:

```text
Batch #1123
 ├── TX#A → contract_call_1
 ├── TX#B → contract_call_2 (same scope)
 └── TX#C → mint_token (compatible lock)

```

---

## 4. Sharding Overview

AST splits transactional processing into **logical shards**, each responsible for a subset of:

- Token namespaces
- Smart contract namespaces
- Address/account ranges

Each shard is a semi-autonomous execution unit with:

- Its own TX queue segment
- Context pool
- State subset

Shards may run on separate threads, cores, or nodes (depending on deployment mode).

---

## 5. Shard Assignment

Transactions are assigned to shards using:

- Static hash partitioning (`address → shard_id`)
- Namespace hints from metadata
- Dynamic congestion-aware routing (future extension)

A transaction may only touch one shard per execution.

Cross-shard calls are rejected or deferred to `shard_bridge_queue`.

---

## 6. Execution Model

Each shard processes batches independently. Batches are:

1. Retrieved from shard-local queue
2. Verified for local consistency
3. Dispatched in controlled sequence
4. Committed to shard-local state

Global state updates are only triggered upon full batch success.

---

## 7. Failure Handling

If a batch fails (e.g. one TX invalidates others):

- The entire batch is rolled back
- TXs may be requeued individually or dropped
- Audit logs are written with batch ID and cause trace

Partial batch execution is not allowed.

---

## 8. Logging and Telemetry

Each batch and shard emits tracking data:

```json
{
  "batch_id": "bt_982",
  "shard_id": "shard_02",
  "tx_count": 5,
  "exec_time_ms": 83,
  "result": "success|failed",
  "gas_total": 88749
}

```

This allows analytics and adaptive load-balancing.

---

## 9. Summary

Batching and sharding are core to AST’s performance and scalability strategy.

They enable parallel execution, minimize conflicts, and ensure consistency even at high transaction volumes.
