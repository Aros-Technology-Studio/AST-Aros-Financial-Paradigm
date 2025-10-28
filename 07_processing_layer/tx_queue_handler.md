# tx_queue_handler.md (1)

# Purpose and Context

---

```markdown
# tx_queue_handler.md

## 1. Purpose and Context

This document defines the architecture and logic of the **transaction queue handler** within the AST system.
The queue handler is the first point of contact for all transactions entering the Processing Layer. It manages intake, buffering, priority sorting, and timing of transaction flow into the execution engine.

All queue operations are fully internal. The queue is not exposed externally, and no user-level access to it exists. It is designed for atomic integrity, deterministic isolation, and resilience under extreme load.

---

## 2. Transaction Intake Mechanism

Transactions may enter the queue from the following internal sources:

- `normalized_tx_pipe` (from crypto ingestion)
- `smart_contract_engine` (internal contract-initiated txs)
- `tokenomic_controller` (mint/burn, collateral ops)
- `scheduled_tasks` (governance-triggered flows)

Each source is assigned an **injection gate** with optional throttle limits.

On arrival, each transaction is validated against minimal preconditions (structure, signature, source registry) before being inserted into the buffer.

---

## 3. Queue Buffer Model

The queue uses a **two-tiered buffering model**:

| Tier            | Medium     | Purpose                                |
|------------------|------------|----------------------------------------|
| `primary_buffer` | In-Memory  | High-speed short-term queue            |
| `overflow_pool`  | Disk/LogDB | Durable fallback for excess or delayed |

The `primary_buffer` operates on lock-free concurrent memory segments (ring buffer or array queue).
If capacity is exceeded or write pressure is high, entries spill into the `overflow_pool`.

---

## 4. Queue Isolation and Channeling

Each queue is logically **channeled by origin and type**, to ensure isolation and determinism:

```text
[ queue_root ]
 ├── normalized_tx/
 ├── internal_contracts/
 ├── token_ops/
 └── governance/

```

Each channel has its own buffering rules, priority weight, and TTL floor.

Cross-channel bleed is not permitted.

---

## 5. Priority Sorting

Transactions within each channel are sorted according to a **multi-factor priority model**:

| Factor | Source |
| --- | --- |
| `tx_priority` | from tx_metadata_flags |
| `gas_estimate` | from dry-run profiling |
| `injection_age` | timestamp of entry |

Transactions with high `tx_priority` or system-critical origin are promoted for early dispatch.

---

## 6. Queue Length Limits & Overflow Strategy

Each channel defines a `max_queue_depth` parameter. When exceeded:

1. Low-priority transactions are **soft-dropped** (with audit logging)
2. Transactions marked with `force_hold` are deferred to `overflow_pool`
3. Emergency GC can be triggered if system pressure exceeds `threshold_x`

No transaction is hard-deleted unless flagged invalid.

---

## 7. Hold State & Locking Logic

Some transactions enter a **Hold State** if:

- They depend on the result of another TX
- They reference a locked resource
- They include `hold_before_exec` flag

Hold entries are stored in a side-cache with expiry timers.

They are periodically rechecked and re-injected when unblocked.

---

## 8. Duplicate Filtering

To prevent replay or congestion by duplicate transactions, the handler applies:

- `tx_id` hashmap lookup (fast match)
- `sender → nonce` window check
- Bloom-filter approximation for near-match scenarios

All collisions are logged and flagged.

---

## 9. TTL (Time-to-Live) Tag Management

Each transaction may include a `ttl_seconds` metadata field.

If the transaction remains in queue beyond its TTL, it is expired and:

- Marked as `dropped_due_to_ttl`
- Archived to audit trace
- Notified (if part of scheduled task or contract chain)

---

## 10. Summary and Next Steps

The queue handler forms the foundation of orderly transaction processing in AST.

Its architecture is designed for **modularity**, **resilience**, and **strict isolation** of flow paths.

Next components in this chain include:

- `tx_dispatch_engine.md`: how transactions are dispatched from queue to execution context
- `tx_execution_contexts.md`: sandboxed containers for runtime-safe transaction execution

# Transaction Intake Mechanism

---

```markdown
## 2. Transaction Intake Mechanism

### 2.1 Overview

The Transaction Intake Mechanism defines how internal and system-generated transactions enter the AST queueing system.
Unlike public blockchain systems, AST does not expose any public RPC or REST API for transaction submission.
Instead, **all incoming transactions originate from authorized internal sources**, each of which is normalized, validated, and flagged before reaching the in-memory queue buffer.

This intake stage is the first gate of the processing layer, and determines whether a transaction is:

- Valid in structure and content
- Properly flagged and typed
- Eligible for entry into the system queue
- Authorized to operate within its declared channel

Transactions that fail intake are immediately rejected, logged, and marked as `intake_rejected`, without consuming queue resources.

---

### 2.2 Accepted Intake Sources

The following internal sources are allowed to submit transactions into the AST system:

| Source Type             | Description                                                           |
|-------------------------|-----------------------------------------------------------------------|
| `system_module`         | Internal components (staking, treasury ops, emission triggers)        |
| `governance_queue`      | Decisions enacted by the governance engine (DAO-level)                |
| `contract_emitter`      | Result of a contract calling another via `emit_tx()`                  |
| `bridge_entry`          | Transactions entering from validated external blockchains             |
| `scheduled_job`         | Cron-like scheduled jobs in tokenomic layers                          |

Each source is **explicitly whitelisted** and pre-registered in the intake registry.

---

### 2.3 Normalization & Envelope Construction

Each incoming TX is transformed into a **normalized intake envelope** with a strict schema.
This ensures uniformity across all internal TXs, regardless of source or logic.

Example envelope:

```json
{
  "tx_id": "f934f57c...",
  "channel": "contract",
  "source": "contract_emitter",
  "received_at": "2025-06-23T03:14:52Z",
  "flags": {
    "priority": "high",
    "ttl": 300,
    "isolated": true
  },
  "payload": {
    "type": "invoke",
    "contract": "vault.lock",
    "args": {
      "amount": "1000000",
      "token": "ARO"
    }
  },
  "signature": {
    "type": "internal_digest",
    "digest": "b2c8fa0..."
  }
}

```

---

### 2.4 Initial Verification Steps

Before a transaction is admitted into the queue buffer, the following **intake filters** are applied:

- **Envelope Schema Check**
    
    Validates required fields, formats, and flag presence.
    
- **Channel-Specific Rules**
    
    Ensures the transaction type is allowed within the declared `channel`.
    
- **Flag Evaluation**
    
    TTL, priority, and isolation mode are parsed and evaluated.
    
- **Signature Check (if required)**
    
    For bridge entries and cross-chain submissions, cryptographic validation is enforced.
    
- **Source Trust Check**
    
    The `source` is compared to the pre-authorized registry of TX submitters.
    

If any of these checks fail, the transaction is:

- Logged with `reason_code`
- Rejected with `status: intake_rejected`
- Added to audit trail with timestamp and source trace

---

### 2.5 Queue Admission

Once all filters are passed, the transaction is accepted into the **queue staging buffer**.

At this point, the transaction is assigned:

- **Queue Slot ID**
- **Internal Timestamp**
- **Hold-State Flag (default: false)**
- **Initial Execution Score (used in sorting)**

The transaction status becomes: `status: received`.

This stage concludes the **Intake Process** and transitions control to the **Queue Buffer Model**.

---

### 2.6 Audit Trail Example

A successful intake is recorded as:

```json
{
  "tx_id": "f934f57c...",
  "status": "received",
  "intake_source": "contract_emitter",
  "received_at": "2025-06-23T03:14:52Z",
  "channel": "contract",
  "priority": "high",
  "ttl": 300,
  "flags": {
    "isolated": true
  }
}

```

A rejected intake is recorded as:

```json
{
  "tx_id": "e920ab1d...",
  "status": "intake_rejected",
  "reason": "invalid_channel_flag",
  "source": "governance_queue",
  "rejected_at": "2025-06-23T03:15:08Z"
}

```

---

### 2.7 Summary

The Transaction Intake Mechanism is a deterministic, rule-based component responsible for ensuring that only **trusted, normalized, and pre-filtered transactions** are allowed into AST’s internal processing queue.

It guarantees that no malformed or unauthorized instructions reach deeper execution layers.

# Queue Buffer Model (In-Memory + Disk-Fallback)

---

```markdown
## Queue Buffer Model (In-Memory + Disk-Fallback)

### Overview

The Queue Buffer Model is the core infrastructure layer responsible for **holding, isolating, and managing transactions** that have passed intake but are not yet dispatched for execution.

This component is engineered to provide:

- High-throughput buffering
- Isolation across transaction types and sources
- Protection from overload or starvation
- Deterministic ordering
- Resilience via disk-based fallback when memory thresholds are exceeded

It serves as the staging area for all transactions entering AST’s processing engine.

---

### Queue Architecture

The queue is structured as a hybrid **multi-channel, prioritized ring buffer** backed by a disk-fallback layer.

Key features include:

- **Channel Segmentation**: Each logical channel (e.g., `contract`, `governance`, `token_ops`) has its own isolated in-memory queue
- **Ring Buffer Rotation**: Circular buffer with a max length per channel; overflows move to disk
- **TTL-aware Indexing**: Fast removal of stale TXs using TTL slots
- **Priority Indexing**: Within each channel, TXs are sorted by declared priority class

```text
[ Channel: governance ]
 ├── High-Priority TXs [sorted by enqueue time]
 ├── Medium-Priority TXs
 └── Low-Priority TXs (may be dropped on overload)

[ Channel: contract ]
 ├── RingBuffer (256 slots)
 └── DiskFallback (FIFO overflow)

```

---

### Memory Thresholds

Each buffer channel is allocated a configurable memory quota:

```toml
[queue.memory_limits]
contract = "64MB"
governance = "32MB"
token_ops = "48MB"

```

If memory consumption exceeds this threshold:

1. Least-recent TXs are serialized and moved to disk
2. Disk-fallback is triggered and read/write queues are rebalanced
3. Dispatch engine continues pulling from memory when available; falls back to disk otherwise

Disk fallback is **transparent**, and no execution priority is lost in fallback-retrieved TXs.

---

### Queue Entry Format

Each transaction is wrapped into a queue entry:

```json
{
  "tx_id": "abc...",
  "received_at": "2025-06-23T04:41:00Z",
  "channel": "contract",
  "priority": "medium",
  "ttl": 300,
  "status": "received",
  "buffer_location": "memory|disk",
  "sort_score": 88712.44
}

```

The `sort_score` is a weighted computation of:

- Enqueue timestamp
- Priority class
- Isolation mode
- Execution domain hint

---

### Isolation Rules

Certain transactions are marked as **isolated**, meaning they must not co-reside in the same batch with others or be dispatched concurrently.

The queue enforces this by:

- Flagging isolated TXs
- Delaying downstream batch formation
- Pausing adjacent transactions in same domain

This prevents lock contention and state race conditions.

---

### Queue Cleanup

A cleanup task periodically:

- Evicts expired transactions (via TTL manager)
- Compacts ring buffers
- Flushes stale disk entries
- Updates audit trail with drop logs

Queue integrity is preserved across system restarts via checkpointing of disk-backed buffers.

---

### Audit Trail Example

```json
{
  "event": "queue_buffer_eviction",
  "tx_id": "abc123...",
  "reason": "ttl_expired",
  "channel": "token_ops",
  "evicted_at": "2025-06-23T04:51:12Z"
}

```

---

### Summary

The Queue Buffer Model is a high-efficiency, fault-tolerant buffering mechanism that guarantees AST can accept, isolate, and manage transactions under dynamic load and scaling conditions.

It bridges intake and dispatch layers, ensuring system integrity and predictability even under saturation.

# Dispatch Scheduling Strategy

---

```markdown
## Dispatch Scheduling Strategy

### Overview

The Dispatch Scheduling Strategy defines **how transactions are selected, ordered, and released** from the queue buffer into the execution layer.
This strategy balances **throughput, fairness, and safety**, ensuring that:

- High-priority operations are not starved
- Isolated transactions are honored
- Long-lived transactions do not block the queue
- Execution remains deterministic across replicas

The scheduler operates as a dedicated internal service, continuously monitoring queue state and applying a dynamic, rule-based scoring system to determine the next execution batch.

---

### Dispatch Cycle Logic

Dispatch occurs in discrete **scheduler cycles**, typically every 50–150 milliseconds depending on system load.

Each cycle performs:

1. **Queue Scan**: All channels are scanned in memory; disk-fallback entries are prefetched when needed.
2. **Candidate Collection**: A pool of executable candidates is built based on TTL, priority, and flags.
3. **Score Assignment**: Each candidate is scored using the `DispatchScore` algorithm.
4. **Batch Formation**: Candidates are sorted, filtered (e.g. isolated, conflicting), and grouped into a batch.
5. **Dispatch Execution**: The batch is passed to the execution context with full state tracking.

---

### DispatchScore Computation

The dispatch score is a weighted composite based on:

| Factor              | Weight | Description                                   |
|---------------------|--------|-----------------------------------------------|
| `priority_level`     | 0.40   | High, Medium, Low                             |
| `enqueue_age`        | 0.25   | How long the TX has waited                    |
| `isolation_mode`     | 0.20   | Penalized for concurrency risk                |
| `execution_domain`   | 0.10   | Domain-local preferences (e.g., vault, bridge)|
| `historical_success` | 0.05   | Favor recent success patterns (optional)      |

The output is a float `DispatchScore` used for candidate sorting.

Example:

```json
{
  "tx_id": "abc...",
  "dispatch_score": 88712.44,
  "factors": {
    "priority": "high",
    "enqueue_age": "92s",
    "isolation": true
  }
}

```

---

### Isolation and Conflict Resolution

Transactions marked as `isolated: true` are only dispatched if:

- The current dispatch window is empty
- No other overlapping TXs (same domain or conflicting state access) are scheduled

If a conflict is detected:

- Conflicting TXs are deferred until the isolation window closes
- Isolation-aware locks are acquired before batch formation

---

### Channel Fairness

To prevent starvation, dispatch fairness is enforced across channels:

- Each channel has a configurable `dispatch_weight`
- Round-robin selection with burst-window throttling
- Channels with low activity are granted minimum guaranteed slots

Example:

```toml
[dispatch.weights]
contract = 5
governance = 2
token_ops = 3

```

---

### Batching Rules

Batches are formed with respect to:

- Max TXs per batch (default: 20)
- Combined memory footprint
- Isolation constraints
- Execution domain grouping (to minimize state switching)

Batches that violate constraints are auto-trimmed or split.

---

### Dry-Run Simulation (Optional Preview Mode)

Before final dispatch, the scheduler may perform a **dry-run simulation** (if enabled) to:

- Verify state snapshot availability
- Detect deterministic failure conditions
- Forecast resource usage

Dry-run failures do **not block execution** but may downgrade TX priority in future cycles.

---

### Dispatch Failures

If a transaction fails during dispatch:

- Its score is decayed temporarily
- It is logged with `dispatch_failure_reason`
- It may enter a **retry backoff window** (default: 3 cycles)

Example:

```json
{
  "tx_id": "def...",
  "status": "dispatch_failed",
  "reason": "isolation_violation",
  "retry_in": 3
}

```

---

### Audit Trail Example

```json
{
  "event": "dispatch_batch_formed",
  "batch_id": "dpx-2039101",
  "tx_ids": ["abc...", "def...", "ghi..."],
  "timestamp": "2025-06-23T05:01:29Z",
  "cycle": 442
}

```

---

### Summary

The Dispatch Scheduling Strategy ensures that transactions are fairly and deterministically selected for execution, while honoring isolation constraints, prioritizing urgent operations, and adapting to system load.

It is the critical bridge between buffering and execution, enforcing the contract of predictability, consistency, and safety within the AST transaction pipeline.

# `Queue Isolation and Channeling`

---

```markdown
### Queue Isolation and Channeling

The AST queue system isolates transactions not only by domain but also by **channel context**, enabling multiple concurrent transaction streams to be processed safely and deterministically.

#### Logical Channel Separation

Each incoming transaction is assigned to a **logical channel**, based on its intent and operational domain. For example:

- `contract`: contract deployment, upgrade, or invocation
- `governance`: AST internal proposals or DAO voting mechanisms
- `token_ops`: mint, burn, transfer, swap of ArosCoin or synthetic tokens
- `bridge_io`: cross-chain token transfer
- `vault_mgmt`: cold/hot wallet adjustments or treasury logic

Each of these is handled in its **own queue buffer**, both in memory and disk-fallback layers, with strict isolation rules.

#### Execution Isolation Groups

Some transactions are marked with `isolation_level: strong` which means:

- They must not be executed in the same batch with others
- They require an exclusive lock on a portion of AST state
- No other transactions from that channel can be executed concurrently

Isolation groups prevent race conditions, state conflicts, or duplicate writes across shared subsystems.

#### Channel Policy Configuration

Each channel may define:

- `max_queue_size`: maximum number of transactions it can hold
- `dispatch_ratio`: weight in round-robin dispatch
- `isolation_policy`: allowed levels of concurrency
- `overflow_strategy`: what to do when full (drop / disk / backpressure)

Example configuration:

```toml
[queue.channels.contract]
max_queue_size = 1000
dispatch_ratio = 4
isolation_policy = "moderate"
overflow_strategy = "disk"

[queue.channels.governance]
max_queue_size = 500
dispatch_ratio = 2
isolation_policy = "strong"
overflow_strategy = "drop"

```

### Flow Control Between Channels

A global flow controller ensures that high-volume channels don’t starve others:

- Uses weighted round-robin with dynamic rate shaping
- Automatically throttles channels that saturate memory or block on locks
- Fairness is enforced even if queues are imbalanced

This guarantees that governance actions or low-frequency ops still get processed in a saturated environment.

### Channel Switch Delays

To prevent state thrashing and lock contention, switching from one execution domain to another introduces a configurable delay (`channel_switch_delay_ms`) between batches.

---

This design allows AST to handle diverse classes of transactions — each with their own lifecycle, risk profile, and processing requirements — without sacrificing determinism, speed, or integrity.

# Priority Sorting

```markdown
### Priority Sorting (based on flags)

Once transactions are normalized and stored in their respective channel queues, the AST system applies a **priority-based sorting mechanism** before dispatching.

Priority is not a simple numeric rank — it's a computed attribute derived from **transaction metadata flags**, submission context, and dynamic system conditions.

#### Priority Flags

Every transaction includes a `priority_flag`, which can be one of:

- `critical` — system-level ops (e.g., rollback, halt, safeguard)
- `high` — financial operations (token mint, burn, emergency transfer)
- `medium` — standard user-triggered operations
- `low` — delayed or low-importance background ops

These flags are determined by the **TX source module**, not by users.

Example:

```json
{
  "tx_id": "0xaca...",
  "metadata": {
    "priority_flag": "high"
  }
}

```

---

### Dynamic Priority Adjustments

The system may dynamically adjust priority based on:

- **Queue saturation**: If a queue exceeds 80% of capacity, `low` is downgraded
- **Execution failures**: Repeated failed TXs are deprioritized
- **Retry count**: TXs with >3 retries are penalized
- **Temporal boost**: `critical` TXs are temporarily boosted for 3 cycles

These adjustments are **non-persistent** and are recalculated every dispatch cycle.

---

### Priority Sorting Algorithm

Each queue channel performs **priority-local sorting** during each scan. Sorting is based on a weight score:

| Flag | Base Score |
| --- | --- |
| critical | 100 |
| high | 70 |
| medium | 50 |
| low | 20 |

The base score is modified by factors like enqueue age, retry penalty, and isolation weight.

Example:

```json
{
  "tx_id": "0xdeadbeef",
  "base_score": 70,
  "age_bonus": 8,
  "retry_penalty": -10,
  "final_score": 68
}

```

TXs are then ordered descending by `final_score`.

---

### Isolation Influence

If a TX is marked `isolated: true`, its **dispatch eligibility is lowered**, even if priority is `high`.

Isolation TXs are dispatched **alone** and must wait for a clean execution window.

To balance this, `isolated_high_priority` transactions receive **a boost every 5 cycles** if they remain unexecuted.

---

### Starvation Prevention

To avoid starvation of `low`-priority TXs:

- Each channel maintains a `fairness_counter`
- If `low`priority TXs are not executed within 50 cycles, they receive temporary `boost_score = +10`
- Boosts are revoked after dispatch or if system load spikes

---

This layered priority system ensures that important operations are not blocked, isolated TXs are protected, and fairness is enforced across the AST transactional pipeline.

```

---

Если готово — двигаемся к следующему пункту:
**Queue Length Limits and Overflow Strategy**.
```

# Queue Length Limits and Overflow Strategy

---

```markdown
### Queue Length Limits and Overflow Strategy

To ensure AST's internal queueing infrastructure remains performant and predictable under load, each transaction channel is governed by strict **length limits** and an **overflow handling strategy**.

These mechanisms prevent denial-of-service conditions, memory exhaustion, or unfair starvation.

#### Queue Capacity Limits

Each queue channel has two main thresholds:

- `max_in_memory`: Maximum number of TXs allowed in memory (ring buffer)
- `max_total`: Absolute ceiling (memory + disk fallback combined)

Configuration example:

```toml
[queue.limits.contract]
max_in_memory = 1024
max_total = 8192
overflow_strategy = "disk"

[queue.limits.governance]
max_in_memory = 128
max_total = 256
overflow_strategy = "drop"

```

If limits are exceeded, the **overflow strategy** is triggered.

---

### Overflow Strategy Options

Each channel defines its own policy for handling queue overflow:

| Strategy | Behavior |
| --- | --- |
| `disk` | Moves oldest TXs to disk-based fallback (preserves order) |
| `drop` | Silently drops lowest-priority TXs (logs event for audit) |
| `backpressure` | Blocks upstream intake until space is freed (delays propagation) |
| `reject` | Returns rejection to source module (TX never enters queue) |

Overflow handling is **non-blocking** unless `backpressure` is explicitly selected.

---

### Drop Policy Logic

When `drop` strategy is in effect, AST uses the following criteria to decide what gets dropped:

1. TXs with `priority_flag = low`
2. TXs with `age > 600s`
3. TXs from non-isolated, non-locked sources
4. TXs with high retry count

Each drop event is recorded in the audit log for postmortem tracing.

Example drop log:

```json
{
  "event": "tx_queue_drop",
  "channel": "token_ops",
  "tx_id": "0xabc...",
  "reason": "overflow",
  "dropped_at": "2025-06-23T05:23:01Z"
}

```

---

### Disk Fallback Coordination

When using `disk` strategy, AST manages a parallel disk buffer per channel. These are:

- Encrypted
- Log-indexed
- Journaling-safe

Dispatch engines alternate between memory and disk queues, preferring memory for latency-sensitive TXs.

Disk queues are cleaned up periodically via the Queue Cleanup Task.

---

This tiered overflow design ensures that the system maintains throughput under extreme loads without compromising stability, fairness, or traceability.

```

---

Если подтверждаешь — я двигаюсь к следующему пункту:
**Hold State and Locking Logic**.
```

# Hold State and Locking Logic

---

```markdown
### Hold State and Locking Logic

In certain execution scenarios, transactions must be temporarily held, deferred, or explicitly locked to ensure system integrity and prevent concurrency collisions.
This section describes AST’s internal mechanisms for managing **Hold State** and **Locking Logic** within its transactional queueing layer.

---

#### Hold State Mechanism

A transaction enters the `hold` state when it **cannot be executed immediately**, due to one or more of the following reasons:

- A **resource or token** it needs is already locked by another TX
- It requires **strong isolation**, and no clean execution window is available
- It was submitted with a future-effective timestamp (`exec_at > now`)
- It’s waiting for a dependent TX to complete (dependency DAG)

TXs in `hold` are moved to a **special memory partition**, sorted by:
- Original queue priority
- Expected release timestamp
- Isolation weight

They are evaluated **on every dispatch cycle** for eligibility to return to active execution.

---

#### Locking Logic (TX-Level Locks)

AST uses **fine-grained locking** to protect critical sections of state. Lock targets include:

- Token balances or supply states
- Specific contract storage ranges
- Governance proposal state
- Vault or escrow ledgers
- Bridge entry points

Each TX declares its **lock signature** at intake:

```json
{
  "tx_id": "0xcafe...",
  "locks": [
    "token:ARO",
    "vault:distribution_pool",
    "contract:0x5c4...e9f::slot:19"
  ]
}

```

If any lock is unavailable, the TX is:

- Placed into `hold` state
- Timestamped with lock wait start
- Re-evaluated every cycle

---

### Deadlock Avoidance

To prevent lock-based deadlocks:

- Locks are **statically ordered** by namespace and lexicographic weight
- TXs cannot acquire partial locks — **all or none**
- Circular dependencies are detected using a real-time **Lock Wait DAG**

If a TX causes a cyclic dependency, it is:

- Dropped (if `max_retry` exceeded)
- Or re-encoded with modified locks (if system allows rewriting)

---

### Lock Expiration

Each lock has a `max_lock_time_ms`, beyond which it will be forcefully expired unless renewed.

Expired locks trigger:

- Forced reprocessing of dependent TXs
- Warning-level entries in the audit log
- Possible rollback if system state was dirtied

Example:

```json
{
  "lock_id": "contract:0x5c4...e9f::slot:19",
  "expired_at": "2025-06-23T06:05:12Z",
  "released_by": "system-cleanup"
}

```

---

This mechanism ensures deterministic ordering, safe state mutation, and controlled deferral — without blocking the entire execution pipeline or violating consistency guarantees.

# Duplicate Filtering

---

```markdown
### Duplicate Filtering

To prevent replay attacks, redundant processing, and wasted execution resources, AST implements a deterministic and high-efficiency **duplicate filtering system** at the queue intake level.

This subsystem operates across all transactional channels and maintains both in-memory and disk-backed registries of recent and active TXs.

---

#### TX Fingerprint Index

Every incoming transaction is **fingerprinted** using a hash of its core attributes:

```json
{
  "tx_id": "0xfeed...",
  "fingerprint": "sha3(tx_type + sender + nonce + payload)"
}

```

This fingerprint is stored in the **TX Duplicate Index**, which is sharded across channels and periodically compressed.

If a new TX shares a fingerprint with:

- **an already executed TX** → it is **immediately rejected**
- **a currently enqueued TX** → it is **ignored and logged**
- **a pending rollback TX** → it is held until the rollback resolves

---

### Near-Match Filtering

In addition to strict matches, AST supports **near-duplicate detection** using:

- Levenshtein distance (for encoded payloads)
- Semantic fingerprint mapping (for contract calls)
- Sender nonce similarity

This mode is optional and only activated in:

- Governance actions
- Contract deployments
- Bridge token swaps

If a near-duplicate is found, the system:

- Flags the TX for manual review (if `review_mode: true`)
- Or rejects it with a `duplicate_code: FZ-211`

---

### Re-Injection Prevention

To prevent users or external systems from re-injecting previously rejected TXs:

- All rejected TX IDs are stored for 12 hours in the **rejection cache**
- The rejection cache is not cleared unless rebooted or purged manually
- Rejected TXs are also logged with reason and rejection path

Example:

```json
{
  "event": "tx_reject",
  "reason": "duplicate",
  "fingerprint": "b9ae34ff...",
  "original_tx_id": "0xabc...",
  "attempted_tx_id": "0xdef...",
  "timestamp": "2025-06-23T06:12:22Z"
}

```

---

### Cross-Channel Matching

In rare cases, cross-channel duplicates may occur (e.g., same logic encoded in both `token_ops` and `vault_mgmt`).

AST handles this by running a **cross-channel fingerprint synchronization** every 30 cycles, comparing:

- Fingerprint hash
- Sender and nonce similarity
- Execution intent overlaps

Duplicates across channels are **deprioritized** and routed to quarantine review unless explicitly permitted by policy.

---

This filtering logic ensures that AST maintains clean queue surfaces, saves compute cycles, and guards against systematic abuse or unintentional replays.

# *TTL (Time-to-Live) Tag Management

---

```markdown
### TTL (Time-to-Live) Tag Management

Each transaction submitted into the AST system may carry an optional or system-assigned **TTL tag** — a time-based validity constraint that governs how long the transaction may remain in the system before it is automatically purged.

This ensures stale or orphaned transactions do not clog queue space or impact execution fairness.

---

#### TTL Tag Structure

TTL is represented as either:

- **Relative TTL** (duration in seconds)
- **Absolute TTL** (UTC expiry timestamp)

Example (relative):

```json
{
  "tx_id": "0xb00f...",
  "metadata": {
    "ttl": 300
  }
}

```

Example (absolute):

```json
{
  "tx_id": "0xdead...",
  "metadata": {
    "ttl_expire_at": "2025-06-23T08:30:00Z"
  }
}

```

If both are present, `ttl_expire_at` takes precedence.

---

### System-Enforced Expiry

TTL values are enforced by the **Queue Expiration Daemon**, which:

- Scans all active and hold-state queues every 30 seconds
- Checks for expired transactions based on system clock
- Removes and logs any expired TXs
- Flags expired TXs in the audit log

Expired TXs are never executed or retried.

---

### Fallback Defaults

If no TTL is provided by the source module, AST applies a **channel-level fallback TTL**, e.g.:

```toml
[queue.ttl_defaults.token_ops]
default_ttl_secs = 600

[queue.ttl_defaults.governance]
default_ttl_secs = 1800

```

These defaults ensure all transactions have bounded lifespans, even if misconfigured upstream.

---

### Expiration Logging

Each TTL expiration generates a trace event:

```json
{
  "event": "tx_expired",
  "tx_id": "0x123...",
  "expired_at": "2025-06-23T06:32:11Z",
  "channel": "bridge_io"
}

```

Expired transactions are never sent to rollback, simulation, or fallback layers. They are discarded cleanly.

---

### Special Handling: Governance and Bridge TXs

Governance votes and cross-chain bridge TXs may have **long TTLs** (up to 48 hours).

These are explicitly whitelisted and exempted from certain purge routines.

In such cases, AST marks them with `ttl_policy: exempt` to prevent premature deletion.

---

This TTL management framework guarantees that transactional queues remain fresh, time-bound, and resistant to stagnation — especially under unpredictable or slow-processing external dependencies.

# Summary and Next Step

---

```markdown
### Summary and Next Steps

The `tx_queue_handler.md` document defines the full architecture and operational flow of AST’s internal transaction queueing layer.

It introduces a hardened and deterministic queuing model that emphasizes:

- Multi-channel separation (`Queue Isolation`)
- Fine-grained `Priority Sorting`
- Protective `Hold State` and locking logic
- Overflow safety via `Queue Length Limits` and fallback strategies
- Replay and spam prevention through `Duplicate Filtering`
- Time-constrained execution control with `TTL Tag Management`

---

#### Architectural Position

The queue handler operates **before** any dispatch, simulation, or execution.
It defines the **first checkpoint** in AST’s processing pipeline, ensuring:

- Controlled intake
- Order preservation
- Threat containment
- State-aware gating of transactions

---

#### Next Layer: Dispatch and Execution

With the queue logic now fully defined, the next components in the `TX Queue & Execution Engine` block are:

1. `tx_dispatch_engine.md` — dispatch orchestration across execution threads
2. `tx_execution_contexts.md` — per-TX isolated runtime containers
3. `tx_rollback_strategy.md` — rollback trigger logic and conditions
4. `tx_batching_and_sharding.md` — horizontal scaling of execution
5. `tx_ttl_expiration.md` — TTL enforcement and passive cleanup

Each of these modules builds upon the integrity and sorting model enforced by the `tx_queue_handler`.

---

This document should now be considered **complete** and **locked** unless later revisions of AST introduce new queue logic requirements or channel types.

```

---