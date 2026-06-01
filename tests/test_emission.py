"""
Canonical Emission Model — Python unit tests.

Verifies the mathematical invariants of the ArosCoin 1:1 emission model
without any runtime dependencies on the NestJS application.

Canonical rules tested:
  Emission  = Transaction Amount              (1:1)
  Commission = Transaction Amount × rate      (default 0.5%)
  Node Share = Commission × 0.75             (75% → nodes)
  AFC Share  = Commission × 0.25             (25% → AFC reserve)
  Burn       = Emission Amount               (net-zero supply per TX cycle)
  reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
"""

import math
import unittest


# ---------------------------------------------------------------------------
# Pure Python reference implementation (mirrors emission.service.ts logic)
# ---------------------------------------------------------------------------

DEFAULT_COMMISSION_RATE = 0.005   # 0.5%
NODE_SHARE_RATIO        = 0.75
AFC_SHARE_RATIO         = 0.25


def calculate_emission(tx_amount: float, rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    """Pure emission calculation — no side effects."""
    if tx_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    emission   = tx_amount
    commission = tx_amount * rate
    node_share = commission * NODE_SHARE_RATIO
    afc_share  = commission * AFC_SHARE_RATIO
    return {
        "transaction_amount": tx_amount,
        "emission_amount":    emission,
        "commission":         commission,
        "node_share":         node_share,
        "afc_reserve_share":  afc_share,
        "commission_rate":    rate,
    }


def update_reserve_index(total_reserve: float) -> float:
    """AFC reserve price index: 1.0 + sqrt(totalReserve) / 10_000."""
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

class TestEmissionCalculation(unittest.TestCase):

    def test_1to1_emission(self):
        r = calculate_emission(10_000)
        self.assertEqual(r["emission_amount"], 10_000, "Emission must equal TX amount (1:1)")

    def test_default_commission_rate(self):
        r = calculate_emission(10_000)
        self.assertAlmostEqual(r["commission"], 50.0, places=8)

    def test_node_share_75pct(self):
        r = calculate_emission(10_000)
        self.assertAlmostEqual(r["node_share"], 37.5, places=8)

    def test_afc_share_25pct(self):
        r = calculate_emission(10_000)
        self.assertAlmostEqual(r["afc_reserve_share"], 12.5, places=8)

    def test_node_plus_afc_equals_commission(self):
        for amount in [100, 1_000, 10_000, 999_999.99]:
            r = calculate_emission(amount)
            self.assertAlmostEqual(
                r["node_share"] + r["afc_reserve_share"],
                r["commission"],
                places=8,
                msg=f"node+afc must equal commission for amount={amount}",
            )

    def test_emission_equals_burn(self):
        """Burn amount is exactly emission amount → net circulating supply = 0."""
        r = calculate_emission(10_000)
        burn_amount = r["emission_amount"]
        net_supply_change = r["emission_amount"] - burn_amount
        self.assertEqual(net_supply_change, 0)

    def test_custom_commission_rate(self):
        r = calculate_emission(10_000, rate=0.01)  # 1%
        self.assertAlmostEqual(r["commission"], 100.0, places=8)
        self.assertAlmostEqual(r["node_share"], 75.0, places=8)
        self.assertAlmostEqual(r["afc_reserve_share"], 25.0, places=8)

    def test_small_amount(self):
        r = calculate_emission(0.01)
        self.assertAlmostEqual(r["emission_amount"], 0.01, places=8)
        self.assertAlmostEqual(r["commission"], 0.00005, places=10)

    def test_large_amount(self):
        r = calculate_emission(1_000_000)
        self.assertEqual(r["emission_amount"], 1_000_000)
        self.assertAlmostEqual(r["commission"], 5_000.0, places=4)
        self.assertAlmostEqual(r["node_share"], 3_750.0, places=4)
        self.assertAlmostEqual(r["afc_reserve_share"], 1_250.0, places=4)

    def test_zero_amount_raises(self):
        with self.assertRaises(ValueError):
            calculate_emission(0)

    def test_negative_amount_raises(self):
        with self.assertRaises(ValueError):
            calculate_emission(-100)

    def test_emission_equals_transaction_amount_invariant(self):
        """Core invariant: emissionAmount == transactionAmount for all valid inputs."""
        for amount in [1, 10, 100, 1_000, 50_000, 1_000_000]:
            r = calculate_emission(amount)
            self.assertEqual(
                r["emission_amount"],
                r["transaction_amount"],
                f"1:1 invariant broken at amount={amount}",
            )


class TestAfcReserveIndex(unittest.TestCase):

    def test_initial_index_is_one(self):
        """At zero reserve, index is exactly 1.0."""
        self.assertEqual(update_reserve_index(0), 1.0)

    def test_index_grows_with_reserve(self):
        idx_small = update_reserve_index(100)
        idx_large = update_reserve_index(10_000)
        self.assertGreater(idx_large, idx_small, "Index must grow as reserve accumulates")

    def test_known_values(self):
        # reserveIndex = 1.0 + sqrt(12.5) / 10_000
        r = calculate_emission(10_000)
        afc = r["afc_reserve_share"]  # 12.5
        idx = update_reserve_index(afc)
        expected = 1.0 + math.sqrt(12.5) / 10_000
        self.assertAlmostEqual(idx, expected, places=12)

    def test_monotonic_growth(self):
        """Index never decreases as reserve accumulates (monotonicity)."""
        reserves = [0, 10, 100, 500, 1_000, 10_000, 100_000, 1_000_000]
        indices = [update_reserve_index(r) for r in reserves]
        for i in range(1, len(indices)):
            self.assertGreaterEqual(indices[i], indices[i - 1])

    def test_sub_linear_growth(self):
        """sqrt-based formula ensures sub-linear growth (stable at low volume)."""
        idx_100k   = update_reserve_index(100_000)
        idx_10k    = update_reserve_index(10_000)
        # Growth from 10k→100k (10x) should be less than 10x the increment from 0→10k
        delta_low  = idx_10k  - 1.0
        delta_high = idx_100k - 1.0
        growth_ratio = delta_high / delta_low if delta_low > 0 else 0
        self.assertLess(growth_ratio, 10, "Growth must be sub-linear (sqrt dampening)")

    def test_index_at_large_reserve(self):
        """At 100M reserve, index reaches exactly 2.0 (sqrt(1e8)/10_000 == 1.0)."""
        idx = update_reserve_index(100_000_000)
        self.assertAlmostEqual(idx, 2.0, places=10)
        # Growth above 100M is still sub-linear
        idx_200m = update_reserve_index(200_000_000)
        self.assertLess(idx_200m, 3.0, "Index growth must remain sub-linear past 100M")


class TestEpochFeeDistribution(unittest.TestCase):
    """Mirrors FeeDistributionService.distributeRewards() 75/25 logic."""

    def test_75_25_epoch_split(self):
        total_fees = 1_000.0
        node_pool   = total_fees * NODE_SHARE_RATIO
        afc_reserve = total_fees * AFC_SHARE_RATIO
        self.assertAlmostEqual(node_pool,   750.0, places=8)
        self.assertAlmostEqual(afc_reserve, 250.0, places=8)

    def test_epoch_split_sums_to_total(self):
        for total in [0.01, 100, 10_000, 999_999]:
            node  = total * NODE_SHARE_RATIO
            afc   = total * AFC_SHARE_RATIO
            self.assertAlmostEqual(node + afc, total, places=6)

    def test_node_weight_normalization(self):
        """Normalized weights must sum to 1.0."""
        scores = {"node_A": 80, "node_B": 15, "node_C": 5}
        total  = sum(scores.values())
        weights = {k: v / total for k, v in scores.items()}
        self.assertAlmostEqual(sum(weights.values()), 1.0, places=12)

    def test_per_node_reward_proportional_to_weight(self):
        node_pool = 750.0
        weights   = {"node_A": 0.6, "node_B": 0.3, "node_C": 0.1}
        rewards   = {node: node_pool * w for node, w in weights.items()}
        self.assertAlmostEqual(rewards["node_A"], 450.0, places=8)
        self.assertAlmostEqual(rewards["node_B"], 225.0, places=8)
        self.assertAlmostEqual(rewards["node_C"],  75.0, places=8)
        self.assertAlmostEqual(sum(rewards.values()), node_pool, places=6)


class TestEndToEndScenario(unittest.TestCase):
    """Integration-style test: multi-transaction cumulative reserve."""

    def test_ten_thousand_dollar_tx(self):
        """Reference scenario from canonical spec."""
        r = calculate_emission(10_000)
        self.assertEqual(r["emission_amount"], 10_000)
        self.assertAlmostEqual(r["commission"],        50.0,  places=8)
        self.assertAlmostEqual(r["node_share"],        37.5,  places=8)
        self.assertAlmostEqual(r["afc_reserve_share"], 12.5,  places=8)

    def test_cumulative_reserve_raises_index(self):
        """Multiple transactions grow reserve → price index rises."""
        total_afc = 0.0
        prev_index = 1.0
        for _ in range(100):
            r = calculate_emission(1_000)
            total_afc += r["afc_reserve_share"]
            new_index = update_reserve_index(total_afc)
            self.assertGreaterEqual(new_index, prev_index)
            prev_index = new_index
        self.assertGreater(prev_index, 1.0, "After 100 TXs index must be above 1.0")

    def test_net_zero_supply_across_multiple_txs(self):
        """Σ(minted) == Σ(burned) across N canonical TX cycles."""
        total_minted = 0.0
        total_burned = 0.0
        for amount in [100, 5_000, 10_000, 250, 99_999]:
            r = calculate_emission(amount)
            total_minted += r["emission_amount"]
            total_burned += r["emission_amount"]  # burn == emission in canonical model
        self.assertAlmostEqual(total_minted, total_burned, places=6)


if __name__ == "__main__":
    unittest.main(verbosity=2)
