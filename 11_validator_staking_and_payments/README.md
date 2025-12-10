# Validator Staking & Payments

## Purpose
This module manages the economic incentives and security deposits for AST validators. It enforces the "PoT Activity + Security Deposit" rule, ensuring that all participants have 'skin in the game'. It handles stake locking, payment distribution based on PoT performance, and punitive slashing.

## Core Services & Components
- **Validator Registration**: Onboarding and identity verification.
- **Stake Management**: Locking, unlocking, and freezing of assets.
- **Payment Distribution**: Calculating and issuing epoch payments.
- **Slashing Engine**: penalizing protocol violations.

## Key Specifications
- [Staking Overview](staking_overview.md)
- [Validator Registration](validator_registration.md)
- [Payment Distribution](payment_distribution_engine.md)
- [Slashing Rules](slashing_and_penalty_rules.md)

## Responsible Team
- Staking Team
