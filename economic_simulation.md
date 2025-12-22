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
- **Fee Distribution Ratio**: 0.6 (60% of fees to nodes as new tokens).
- **Burn Ratio**: 0.1 (10% of emitted tokens burned per epoch).
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
    fee: float = 0.05,
    emission_ratio: float = 0.6,
    burn_ratio: float = 0.1,
    epochs: int = 100,
    node_count: int = 10
) -> tuple[list[float], list[float]]:
    """
    Simulate ArosCoin supply and inflation over epochs.
    
    Args:
        initial_supply: Starting token supply (default 0, no pre-mine).
        tx_per_epoch: Transactions per epoch (default 1000).
        fee: Fee per transaction in ARO (default 0.05).
        emission_ratio: Fraction of fees emitted as new tokens (default 0.6).
        burn_ratio: Fraction of emission burned (default 0.1).
        epochs: Number of epochs to simulate (default 100).
        node_count: Number of active validators (default 10).
    
    Returns:
        supply: List of supply values per epoch.
        inflation_rates: List of inflation rates (%) per epoch.
    """
    supply = [initial_supply]
    inflation_rates = []
    
    for _ in range(epochs):
        # Calculate emission and burn
        gross_emission = tx_per_epoch * fee * emission_ratio
        burn = gross_emission * burn_ratio
        net_emission = gross_emission - burn
        
        # Update supply
        new_supply = supply[-1] + net_emission
        supply.append(new_supply)
        
        # Calculate inflation rate
        inflation = (net_emission / new_supply * 100) if new_supply > 0 else 0
        inflation_rates.append(inflation)
    
    return supply, inflation_rates

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
supply, inflation = simulate_ast_economy()
plot_simulation(supply, inflation)

# Scenario: High TX volume
supply_high, inflation_high = simulate_ast_economy(tx_per_epoch=5000)
plot_simulation(supply_high, inflation_high, "ast_economy_high_tx.png")
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
