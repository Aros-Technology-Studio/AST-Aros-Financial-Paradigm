# Token Issuance Protocol

Issuance defines how newly minted ARO moves from the Coin Engine into ecosystem circulation while
respecting compliance, vesting, and accountability requirements.

## Pre-Issuance Checks

- **Emission Proof**: Validate epoch proof hash from the emission controller.
- **Vault Balances**: Ensure receiving vault capacity remains within policy bounds.
- **Compliance Clearance**: Confirm recipients maintain active KYC status and no outstanding
sanctions.

## Issuance Flow

1. **Instruction Creation**: Governance or automated schedules generate issuance instructions.
2. **Policy Evaluation**: The rule engine verifies lock schedules, vesting cliffs, and compliance flags.
3. **Execution**: Tokens transfer to target vaults or beneficiary contracts with event logging.
4. **Notification**: Stakeholders receive alerts, and entries are written to the audit ledger.

## Vesting Mechanics

- **Linear Vesting**: Ecosystem grants typically vest linearly with monthly unlocks.
- **Milestone-Based**: Strategic partnerships unlock upon proof of milestone completion.
- **Clawback Rights**: Governance can reclaim unvested tokens if obligations are not met.

## Emergency Stop

In case of detected fraud or regulatory orders, the issuance controller can pause pending instructions.
Paused items require explicit governance action to resume.
