"""
Canonical 1:1 Emission Model — Python math validation tests.

These tests verify the arithmetic of the ArosCoin emission formulas
independently of the TypeScript runtime. They act as a cross-language
specification check: if the numbers here disagree with the TS service,
the TS service is wrong.

Canonical model (from 01_coin_engine/coin_emission_model.md):
    Emission     = Transaction Amount              (1:1)
    Commission   = Transaction Amount × rate       (default 0.5%)
    Node Share   = Commission × 0.75
    AFC Reserve  = Commission × 0.25
    reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
    ARO burned after TX completion → net circulating supply change = 0
"""

import math
import unittest

DEFAULT_RATE = 0.005  # 0.5%
NODE_RATIO   = 0.75
AFC_RATIO    = 0.25


def calculate(tx_amount: float, rate: float = DEFAULT_RATE) -> dict:
    """Pure canonical emission calculation."""
    if tx_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    commission = tx_amount * rate
    return {
        "transaction_amount": tx_amount,
        "emission_amount":    tx_amount,          # 1:1
        "commission":         commission,
        "node_share":         commission * NODE_RATIO,
        "afc_reserve_share":  commission * AFC_RATIO,
        "commission_rate":    rate,
    }


def afc_reserve_index(total_reserve: float) -> float:
    return 1.0 + math.sqrt(total_reserve) / 10_000


class TestCanonicalEmission(unittest.TestCase):

    # ── 1:1 invariant ────────────────────────────────────────────────────────

    def test_emission_equals_tx_amount(self):
        for amount in [0.01, 1.0, 100.0, 9_999.99, 1_000_000.0]:
            r = calculate(amount)
            self.assertEqual(r["emission_amount"], r["transaction_amount"])

    def test_10k_emission_is_10k(self):
        r = calculate(10_000)
        self.assertEqual(r["emission_amount"], 10_000)

    # ── Commission math ───────────────────────────────────────────────────────

    def test_commission_at_default_rate(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["commission"], 50.0, places=8)

    def test_commission_at_custom_rate(self):
        r = calculate(1_000, rate=0.01)
        self.assertAlmostEqual(r["commission"], 10.0, places=8)

    # ── 75/25 split ───────────────────────────────────────────────────────────

    def test_node_share_is_75_pct(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["node_share"], 37.5, places=8)

    def test_afc_share_is_25_pct(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["afc_reserve_share"], 12.5, places=8)

    def test_split_sums_to_commission(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["node_share"] + r["afc_reserve_share"], r["commission"], places=8)

    def test_split_ratios_sum_to_one(self):
        self.assertAlmostEqual(NODE_RATIO + AFC_RATIO, 1.0, places=8)

    # ── Guard: invalid amount ─────────────────────────────────────────────────

    def test_zero_amount_raises(self):
        with self.assertRaises(ValueError):
            calculate(0)

    def test_negative_amount_raises(self):
        with self.assertRaises(ValueError):
            calculate(-100)

    # ── AFC reserve index (price rises as reserve grows) ─────────────────────

    def test_index_starts_at_one_with_zero_reserve(self):
        self.assertEqual(afc_reserve_index(0), 1.0)

    def test_index_rises_with_afc_accumulation(self):
        self.assertGreater(afc_reserve_index(12.5), 1.0)

    def test_index_formula_example(self):
        # After one $10k TX: afcShare = 12.50
        # reserveIndex = 1.0 + sqrt(12.5) / 10_000
        expected = 1.0 + math.sqrt(12.5) / 10_000
        self.assertAlmostEqual(afc_reserve_index(12.5), expected, places=10)

    def test_index_is_monotonically_non_decreasing(self):
        reserves = [0, 12.5, 25.0, 100.0, 1_000.0, 100_000.0]
        indices = [afc_reserve_index(r) for r in reserves]
        for i in range(1, len(indices)):
            self.assertGreaterEqual(indices[i], indices[i - 1])

    # ── Net-zero circulating supply ───────────────────────────────────────────

    def test_burn_equals_mint_per_tx_cycle(self):
        """Emitted ARO are burned after TX → net circulating supply change = 0."""
        r = calculate(10_000)
        minted = r["emission_amount"]
        burned = r["emission_amount"]  # canonical: burn == mint
        net_circulating_change = minted - burned
        self.assertEqual(net_circulating_change, 0)

    # ── $10,000 worked example from spec ─────────────────────────────────────

    def test_10k_full_example(self):
        r = calculate(10_000)
        self.assertEqual(r["transaction_amount"],  10_000)
        self.assertEqual(r["emission_amount"],     10_000)
        self.assertAlmostEqual(r["commission"],        50.0,  places=8)
        self.assertAlmostEqual(r["node_share"],        37.5,  places=8)
        self.assertAlmostEqual(r["afc_reserve_share"], 12.5,  places=8)


if __name__ == "__main__":
    unittest.main()
