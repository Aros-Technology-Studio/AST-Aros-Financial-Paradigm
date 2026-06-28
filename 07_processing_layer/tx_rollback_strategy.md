# tx_rollback_strategy.md

## 1. Purpose

This document outlines the **rollback strategy** used within the AST transaction processing layer when a transaction fails, aborts, or must be reversed due to system-level inconsistencies, constraint violations, or partial execution states.

Rollback is **not optional** — it is a mandatory mechanism ensuring state consistency, atomicity, and auditability.

---

## 2. Rollback Triggers

Rollback is triggered under the following conditions:

- Transaction execution error (runtime exception, invalid state access)
- Guardrail violation (unauthorized op, unsafe opcode)
- System interruption (crash, timeout, kill signal)
- External veto from simulation layer
- State commitment failure (write rejection)

---

## 3. Rollback Phases

Rollback proceeds through several controlled stages:

```text
[TX Execution Failure]
   ↓
[Capture Pre-State Snapshot]
   ↓
[Mark TX as Rollback-Initiated]
   ↓
[Reverse State Delta]
   ↓
[Revert Locks, Gas, Temporary Assets]
   ↓
[Log Rollback Event]

```

---

## 4. Pre-State Snapshots

Before executing a transaction, a **snapshot of the mutable state** is taken:

- Account balances
- Contract storage
- Nonce counters
- Temporary ownership structures
- Lock tables

This snapshot is used to reconstruct the pre-execution state during rollback.

---

## 5. Rollback Execution

The reversal is applied by executing an inverse delta on:

- Affected balances
- Modified storage slots
- Deleted/generated contracts
- Temporary token emissions

Gas units already consumed are **not refunded**, unless transaction type explicitly allows it (`reversible_gas: true`).

---

## 6. Rollback Isolation

Rollback is conducted in a **dedicated rollback context** to:

- Avoid contamination of active execution channels
- Prevent re-entry or recursion
- Guarantee serialized reversion

---

## 7. Lock Table Cleanup

All locks acquired during failed execution are:

- Immediately released
- Logged with a `rollback_release_flag`
- Blacklisted from reentry (if marked unsafe)

This avoids deadlocks and race conditions.

---

## 8. Logging Rollback

Each rollback is archived with full traceability:

```json
{
  "tx_id": "<hash>",
  "rollback_reason": "execution_error|timeout|guardrail_violation|...",
  "timestamp": "ISO8601",
  "affected_entities": [...],
  "pre_state_hash": "<hash>",
  "post_rollback_hash": "<hash>"
}

```

---

## 9. Summary

Rollback is an essential fail-safe within AST’s execution lifecycle.

It guarantees that no faulty, partial, or unsafe transaction can alter the committed state irreversibly.

Rollback is deterministic, isolated, logged, and enforced automatically upon any transactional fault.
