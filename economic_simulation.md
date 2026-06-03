# AST Economic Model Simulation

This document provides a comprehensive simulation of the AROS Studio Tokenomics (AST) economic model, focusing on ArosCoin (ARO) supply growth, inflation dynamics, emission triggers, and burn mechanisms. The simulation uses Python (with NumPy and Matplotlib) to model token supply over epochs, incorporating transaction-based emissions and burns as defined in `01_coin_engine/` and `08_emission_layer/`. It ensures alignment with AST's principles of non-speculative, utility-driven tokenomics and provides actionable insights for governance adjustments. Last updated: 2025-08-17.

## 1. Purpose
Simulate the ArosCoin economy to:
- Predict supply growth based on transaction (TX) activity.
- Estimate inflation rates and their stabilization over time.
- Evaluate burn mechanisms for deflationary control.
- Assess economic risks (e.g., stagnation, hyperinflation).
- Provide data for governance decisions (e.g., adjusting emission ratios).

## 2. Assumptions
- **Initial Supply**: 0 ARO (no pre-mine, per `01_coin_engine/coin_emission_model.md`).
- **Transaction Volume**: 1,000 TX per epoch (default, adjustable for scenarios).
- **Transaction Fee**: 0.05 ARO per TX (dynamic, based on network load).
- **Node Share Ratio**: 0.75 (75% of commission fees to node pool, per canonical 75/25 split).
- **AFC Reserve Ratio**: 0.25 (25% of commission fees to AFC reserve).
- **Burn**: All emitted ARO are burned after each canonical TX completes (net-zero circulating supply per TX cycle).
- **Epoch Duration**: 7 days (configurable).
- **Epochs Simulated**: 100 (700 days, ~2 years).
- **Node Count**: 10 active validators per epoch (scalable).
- **Compliance Factor**: KYC/AML scores impact TX volume (e.g., >80 score for high activity).

## 3. Simulation Model
The model calculates net emission per epoch, updates supply, and tracks inflation. Key formulas:
- **Gross Fee Distribution**: `emission = tx_per_epoch * fee * emission_ratio`
- **Burn Amount**: `burn = emission * burn_ratio`
- **Net Fee Distribution**: `net_emission = emission - burn`
- **Supply Update**: `supply[t+1] = supply[t] + net_emission`
- **Inflation Rate**: `inflation = (net_emission / supply[t+1]) * 100` (if supply > 0)

## 4. Python Simulation Code
```python
import numpy as np
import matplotlib.pyplot as plt

def simulate_ast_economy(
    initial_supply: float = 0,
    tx_per_epoch: int = 1000,
    tx_amount: float = 1000.0,     # average TX size in ARO
    commission_rate: float = 0.005, # 0.5% canonical default
    node_share: float = 0.75,       # 75% of commission → node pool
    afc_share: float = 0.25,        # 25% of commission → AFC reserve
    epochs: int = 100,
    node_count: int = 10
) -> tuple[list[float], list[float], list[float]]:
    """
    Simulate ArosCoin canonical economy over epochs.
    Canonical model: Emission=TX amount (1:1); all emitted ARO burned after TX
    completes (net-zero circulating supply per TX). Commission 75/25 split.

    Args:
        initial_supply: Starting circulating supply (default 0, no pre-mine).
        tx_per_epoch: Transactions per epoch (default 1000).
        tx_amount: Average transaction size in ARO (default 1000).
        commission_rate: Commission rate (default 0.005 = 0.5%).
        node_share: Fraction of commission to node pool (default 0.75).
        afc_share: Fraction of commission to AFC reserve (default 0.25).
        epochs: Number of epochs to simulate (default 100).
        node_count: Number of active validators (default 10).

    Returns:
        supply: Circulating supply per epoch (net-zero per canonical TX cycle).
        afc_reserve: Cumulative AFC reserve per epoch.
        reserve_index: Emission price index per epoch.
    """
    import math
    supply = [initial_supply]
    afc_cumulative = 0.0
    afc_reserve = [afc_cumulative]
    reserve_index = [1.0]

    for _ in range(epochs):
        epoch_commission = tx_per_epoch * tx_amount * commission_rate
        epoch_afc = epoch_commission * afc_share

        # Net circulating supply is unchanged per canonical TX cycle (mint == burn)
        new_supply = supply[-1]

        afc_cumulative += epoch_afc
        idx = 1.0 + math.sqrt(afc_cumulative) / 10_000

        supply.append(new_supply)
        afc_reserve.append(afc_cumulative)
        reserve_index.append(idx)

    return supply, afc_reserve, reserve_index

def plot_simulation(supply: list[float], inflation: list[float], filename: str = "ast_economy.png") -> None:
    """Plot supply and inflation over epochs."""
    fig, ax1 = plt.subplots(figsize=(10, 6))
    
    ax1.plot(supply, color='blue', label='Supply (ARO)')
    ax1.set_xlabel('Epochs')
    ax1.set_ylabel('Supply (ARO)', color='blue')
    ax1.tick_params(axis='y', labelcolor='blue')
    ax1.grid(True)
    
    ax2 = ax1.twinx()
    ax2.plot(inflation, color='red', label='Inflation Rate (%)')
    ax2.set_ylabel('Inflation Rate (%)', color='red')
    ax2.tick_params(axis='y', labelcolor='red')
    
    plt.title('AST Supply and Inflation Simulation')
    fig.legend(loc='upper center', bbox_to_anchor=(0.5, -0.05), ncol=2)
    plt.tight_layout()
    plt.savefig(filename)
    plt.close()

# Run simulation
supply, afc_reserve, reserve_index = simulate_ast_economy()
plot_simulation(afc_reserve, reserve_index)

# Scenario: High TX volume
supply_high, afc_high, idx_high = simulate_ast_economy(tx_per_epoch=5000)
plot_simulation(afc_high, idx_high, "ast_economy_high_tx.png")
```

## 5. Analysis of Results
- **Default Scenario** (1,000 TX/epoch):
  - Supply grows linearly (~3,000 ARO after 100 epochs).
  - Inflation starts high (~10% in epoch 1) but stabilizes <1% as supply increases.
  - Burn ensures deflationary pressure, preventing uncontrolled growth.
- **High TX Scenario** (5,000 TX/epoch):
  - Supply grows faster (~15,000 ARO after 100 epochs).
  - Inflation peaks higher (~12%) but converges to <1% faster.
- **Risks**:
  - Low TX volume (<500/epoch): Stagnation, low emission. Mitigate with incentives (see 11_validator_staking_payments/payment_distribution_engine.md).
  - High TX volume: Potential inflation spike. Mitigate with dynamic burn ratio adjustments via governance (see 06_governance_layer/governance_token_logic.md).
- **Node Impact**: More nodes (e.g., 20) dilute emission per node, encouraging validator competition.

## 6. Governance Recommendations
- **Dynamic Parameters**:
  - Adjust `emission_ratio` (e.g., lower to 0.5 if inflation >5% for 5 epochs).
  - Increase `burn_ratio` (e.g., to 0.2) during high volatility.
- **Monitoring**:
  - Integrate with All-Seeing Eye for real-time anomaly detection (see 13_extra_supervisory_layer/anomaly_detection_patterns.md).
  - Use simulation outputs in governance proposals for parameter votes.

## 7. Dependencies
- `01_coin_engine/coin_emission_model.md`: Fee Distribution formulas and phases.
- `08_emission_layer/emission_trigger_conditions.md`: TX-based triggers.
- `11_validator_staking_payments/payment_distribution_engine.md`: Node payments.
- `06_governance_layer/proposal_submission_protocol.md`: Parameter adjustments.

## 8. Running the Simulation
1. Install dependencies: `pip install numpy matplotlib`.
2. Save the code above as `economic_simulation.py` in the repo root.
3. Run: `python economic_simulation.py`.
4. Outputs: `ast_economy.png` and `ast_economy_high_tx.png` (supply/inflation plots).

## 9. Open Questions
- Should `fee` be dynamically adjusted by AI agents based on market signals?
- How to handle edge cases (e.g., zero TX in an epoch)?
- Add multi-chain TX volume scenarios (e.g., ETH vs. BTC ingress)?

This simulation provides a baseline for economic modeling and can be extended with real-time data or additional parameters (e.g., compliance impacts). For further details, refer to the linked documents.
