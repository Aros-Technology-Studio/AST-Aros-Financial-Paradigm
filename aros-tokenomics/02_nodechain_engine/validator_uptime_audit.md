# validator_uptime_audit.md (1)

---

```
# validator_uptime_audit.md

## 🎯 Purpose

This document outlines the system by which validator node uptime is monitored, recorded, and audited across the AST network. Uptime directly affects governance eligibility, reward distribution, and node reputation.

---

## 1. Uptime Importance

- Nodes must maintain consistent online presence to secure the network
- Uptime audits ensure fair participation and prevent reward abuse
- Audit results are stored on-chain and impact future node privileges

---

## 2. Audit Frequency and Scope

- Audits occur every **epoch** (e.g., every 12 hours)
- Each audit includes:
  - Node heartbeat signals
  - Latency and response checks
  - Block participation logs
  - Downtime cause flags (if applicable)

---

## 3. Metrics Collected

| Metric                    | Description                                      |
|---------------------------|--------------------------------------------------|
| `uptime_ratio`            | % of expected availability met during epoch     |
| `response_time_avg`       | Mean time to respond to audit ping              |
| `block_miss_rate`         | % of missed block participation opportunities   |
| `error_code`              | Code indicating root cause of any downtime      |

---

## 4. Reputation Penalties

- Nodes with <97% uptime over last 30 epochs:
  - Lose governance participation privileges
  - Enter **probation mode** (lower reward tier)
- Chronic offenders flagged for slashing appeal

---

## 5. Node Appeal Process

- Nodes may appeal audit results by:
  - Submitting log evidence (signed)
  - Providing root cause analysis
  - Requesting temporary whitelisting from audit authority
- Appeals evaluated by governance committee or All-Seeing Eye layer (if enabled)

---

## ✅ Checklist

- [ ] Audit daemon deployed to all active validators
- [ ] Audit logs streamed to on-chain oracle
- [ ] Epoch-level metrics made queryable via API
- [ ] Appeals dashboard integrated into validator portal
```

---