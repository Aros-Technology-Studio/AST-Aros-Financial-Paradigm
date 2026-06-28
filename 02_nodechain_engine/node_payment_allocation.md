# Node Payment Allocation

## 🎯 Purpose of This Document

This document defines the algorithm and principles for distributing processing payments to nodes participating in AST's decentralized encryption and transaction validation system. The payment model is not based on mining or staking, but on actual contribution to live transaction processing.

---

## 💡 Conceptual Overview

AST payments nodes proportionally to their workload and successful fragment encryption, not based on uptime or coin holdings.

**Key Factors in Payment Calculation:**
- Number of transaction fragments encrypted
- Node reputation and encryption accuracy
- Participation fairness (to avoid monopolization)
- Energy efficiency (optional, in eco mode)

---

## 📐 Payment Formula

Let:

- `R` = total payment pool for a transaction
- `F` = number of fragments (total nodes used)
- `Wi` = workload coefficient of node *i*
- `ΣW` = total workload across all nodes

Then the payment `Ri` for node *i*:

```math
Ri = (Wi / ΣW) * R
```

Where:

- Wi is normalized based on:
    - encryption latency
    - response time
    - previous trust score
    - verification success rate

---

## **📊 Example Allocation**

| **Node ID** | **Workload (Wi)** | **% of Total** | **Payment (Ri)** |
| --- | --- | --- | --- |
| node_431 | 1.5 | 30% | $0.30 |
| node_882 | 1.0 | 20% | $0.20 |
| node_217 | 2.5 | 50% | $0.50 |
| **Total** | **5.0** | 100% | **$1.00** |

---

## **🧩 Anti-Monopoly Measures**

- **Round-robin enforcement**: No node can participate in two consecutive rounds.
- **Penalty system**: Lower score if node drops a payload mid-process.
- **Reputation decay**: Long-term inactive nodes lose trust credits.

---

## **🔒 Payment Mechanism**

- Payments are paid in **ArosCoin** (ARO)
- Distributed to node’s wallet address via internal settlement contract
- Smart contract handles bulk payment batching to minimize gas fees

```
// Pseudocode only
if (verifyNodeWork(nodeID, txID)) {
    distributePayment(nodeWallet, paymentAmount);
}
```

---

## **🏁 Special Conditions**

| **Condition** | **Adjustment** |
| --- | --- |
| Node used eco-mode processing | +5% payment bonus |
| Node latency above 300ms | -10% payment deduction |
| Node contributed to system bug fix | +1% long-term bonus rate |

---

## **📁 Repository Location**

```
ast/
└── 03_security_layer/
    └── node_payment_allocation.md
```
