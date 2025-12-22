# Node Financial Guarantee & Compliance (ALB)

## Overview

This document outlines the **Financial Guarantee** model managed exclusively by the **Authorized Liquidity Bridge (ALB)**.

> [!IMPORTANT]
> **AFC THESIS 5 COMPLIANCE:**
> The NodeChain Engine DOES NOT hold, freeze, or manage assets.
> All financial guarantees are held in segregated accounts at the ALB side.

## The Model: Compliance Signal

Validation Nodes provide a **Financial Guarantee** to ensure honest behavior. This is NOT a "stake" in the network, but a collateral bond held by a regulated entity.

1. **Deposit**: Node Operator deposits 100,000 AFC into the ALB.
2. **Signal**: ALB emits a `GuaranteeSecure` signal to the NodeChain.
3. **Activation**: Node becomes active based on this signal.

## Non-Compliance & Forfeiture

If the NodeChain detects malicious behavior (e.g., double-signing batches):

1. **Signal**: NodeChain emits a `SignalOfNonCompliance`.
2. **Action**: The ALB (off-chain) processes the forfeiture of the financial guarantee based on legal contracts.
3. **Result**: The Node is de-activated in the NodeChain.

**Key Distinction**:

- **Legacy capability**: Codebase freezes assets directly.
- **AFC Standard**: Codebase only emits DATA SIGNALS. Financial actions are external.
