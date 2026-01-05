# Fee Distribution Layer (Module 08)

This module handles the distribution of transaction fees to NodeChain validators based on the Proof-of-Transaction (PoT) consensus. Unlike traditional blockchains with inflationary block rewards, AST distributes collected fees to nodes based on their verified work.

## Components

### Fee Distribution Service
- **Service**: `src/fee_distribution/fee_distribution.service.ts`
- **Responsibility**: 
  - Manages Epochs (start/finalize).
  - Calculates total fees collected in an epoch.
  - Fetches node performance metrics from NodeChain.
  - Calculates PoT weights dynamically.
  - Executes reward payments (System Transfers) to nodes.

### Fraud Prevention Service
- **Service**: `src/fee_distribution/fraud-prevention.service.ts`
- **Responsibility**: Detects and blocks fraudulent activity such as replay attacks, circular processing loops (wash trading), and artificial volume saturation before rewards are calculated.

## Workflow
1. **Epoch Start**: A new epoch is initialized.
2. **Fee Collection**: Transactions occur; fees accumulate in the System Fee Pool.
3. **Epoch Finalization**:
   - Total fees are summed.
   - Node metrics (uptime, validations) are retrieved.
   - PoT weights are calculated: $W_i = \alpha T_i + \beta F_i - \delta P_i$.
   - Rewards are distributed: $R_i = TotalFees \times W_i$.
4. **Payout**: Funds are transferred from Fee Pool to Node Wallets.
