# Emission Layer (Module 08)

This module handles the protocol-level issuance of ArosCoins based on the Proof-of-Transaction (PoT) consensus.

## Components

### Fraud Prevention Service
- **Service**: `src/emission/fraud-prevention.service.ts`
- **Documentation**: `docs/emission/emission_fraud_prevention.md`
- **Responsibility**: Detects and blocks fraudulent emission triggers such as replay attacks, circular loops, and artificial saturation.

## Usage
The `EmissionFraudPreventionService` scans every potential emission-triggering transaction before it is committed to the ledger.
