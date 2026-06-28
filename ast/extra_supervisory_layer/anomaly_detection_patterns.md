# Anomaly Detection Patterns

## 1. Purpose

This document defines the **recognized patterns of architectural anomaly**, protocol drift, or structural inconsistency that The All-Seeing Eye is designed to detect within the AST execution framework. These patterns do not require code-level access, only metadata and behavior snapshots.

---

## 2. What Is an Anomaly?

In this context, an anomaly is any **observable deviation** from expected protocol behavior, including:

- Timing irregularities
- Metadata mismatches
- Execution order violations
- Drift from declared architecture logic
- Pattern-based exploit signals

Anomalies are **not** errors, failures, or bugs — they are **structural warnings**.

---

## 3. Recognized Pattern Categories

### A. Governance Irregularities

| Pattern ID | Description                                            |
|------------|--------------------------------------------------------|
| GOV-001    | Proposal submitted without quorum anchor               |
| GOV-002    | Vote weight mismatch between snapshot and execution    |
| GOV-003    | Role delegation recursion detected                     |
| GOV-004    | Excessive voting delay (> 3 snapshots per action)      |

---

### B. Execution Flow Deviation

| Pattern ID | Description                                          |
|------------|------------------------------------------------------|
| EXE-101    | Transaction replay detected within short window       |
| EXE-102    | Skipped queue entries without justification           |
| EXE-103    | Divergent Merkle hash from expected post-commit state |

---

### C. Token System Warnings

| Pattern ID | Description                                         |
|------------|-----------------------------------------------------|
| TOK-201    | Mint event without authorized proposal link         |
| TOK-202    | Supply drift > threshold in epoch                    |
| TOK-203    | Burn recorded with missing withdrawal hash           |

---

### D. Anomaly Volume Spikes

| Pattern ID | Description                                       |
|------------|---------------------------------------------------|
| VOL-301    | Sudden surge in governance traffic                 |
| VOL-302    | Unexpected increase in invalidation signals        |
| VOL-303    | Overlapping execution events within non-parallel zone |

---

## 4. Pattern Hashing

Each anomaly is fingerprinted and logged using a unique hash:

```json
{
  "anomaly_id": "EXE-102",
  "hash": "0xa7f23b...",
  "detected_at": 1731942032,
  "source": "execution_queue",
  "severity": "high"
}
```

This hash is stored in the **Immutable Oversight Ledger** and exposed via observer interface.

---

## 5. False Positive Handling

To reduce noise:

- A cooldown is enforced between repeated detections
- Known benign patterns can be marked with soft-ignore
- Observers may submit "explanation bundles" for human review

---

## 6. Pattern Extension

New detection rules can be added via:

- Observer node proposals
- Governance-approved updates to detection schema
- AI-assisted behavioral learning (future phase only)

---

## 7. Summary

The Eye doesn’t evaluate intent — only **deviation**.

Its job is to recognize subtle shifts in architecture conformance before they cause systemic degradation.
