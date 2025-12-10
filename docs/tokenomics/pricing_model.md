# Token Pricing & Emission Models

## 1. Dynamic Token Pricing

The price of the token is determined dynamically to balance demand and supply.

$$
P = \alpha \cdot \log(\text{Utilization Index}) + \beta \cdot FX_{vol} + \gamma
$$

Where:

* **Price ($P$)**: Current estimated value or target price.
* **Utilization Index**: Network load metric (0.0 to 1.0+).
* **$FX_{vol}$**: Volatility of underlying fiat currencies/assets.
* **$\alpha, \beta, \gamma$**: Tuning parameters set by governance to control sensitivity.

**Purpose**: To ensure the token price reflects real utility and risk.

## 2. Emission Volume Calculation

The total emission of new tokens is linked to transaction volume and network load.

$$
TE = \alpha \cdot TV + \beta \cdot U + \gamma
$$

Where:

* **$TE$**: Total new emission amount.
* **$TV$**: Transaction Volume (value processed).
* **$U$**: Network Utilization (same as above).
* **$\alpha, \beta, \gamma$**: Inflation control parameters.

**Purpose**: To align supply growth with actual economic activity (preventing hyperinflation or shortage).
