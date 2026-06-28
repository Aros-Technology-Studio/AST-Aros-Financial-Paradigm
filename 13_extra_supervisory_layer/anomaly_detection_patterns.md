# anomaly_detection_patterns.md

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
| GOV-004    | Excessive voting delay (> 3 blocks per action)         |

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

## 7. Dynamic Anomaly Detection with Machine Learning

### Purpose

To enhance static pattern detection with adaptive, data-driven models that learn from historical logs without requiring code-level access.

### Implementation Recommendations

- **ML Integration**: Use a lightweight ML module (e.g., scikit-learn or TensorFlow Lite) in observer nodes. Train on anonymized metadata (e.g., timing irregularities) from immutable logs.
    - Example Workflow:
        1. Collect training data: Query logs for past anomalies (e.g., via meta_event_logging_protocol.md).
        2. Model: Use unsupervised learning (e.g., Isolation Forest) to detect outliers in metrics like vote delays or supply drifts.
        3. Thresholds: Set dynamic thresholds (e.g., >2σ deviation) adjustable via governance proposals.
- **New Pattern Category: ML-Based Warnings**
    
    
    | Pattern ID | Description |
    | --- | --- |
    | ML-401 | Unsupervised outlier in execution timing (e.g., >20% latency spike) |
    | ML-402 | Cluster-based drift in token events (e.g., unusual mint patterns) |

### Extension Rules

- Train models off-chain in observer nodes, then validate via co-signing.
- Governance Approval: New ML models require proposal vote and audit (link to security_audit_protocol.md).
- Privacy: Ensure no raw data is used; only aggregated metadata.

This addition makes detection more proactive, reducing false positives over time.
