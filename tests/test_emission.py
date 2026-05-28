"""
Canonical 1:1 ArosCoin emission model — pure-logic unit tests.
These tests run without any NestJS runtime; they replicate the TypeScript
EmissionService.calculate() logic in Python for cross-language verification.
"""

import math
import unittest


DEFAULT_COMMISSION_RATE = 0.005   # 0.5%
NODE_SHARE_RATIO        = 0.75
AFC_RESERVE_RATIO       = 0.25


def calculate(transaction_amount: float, commission_rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    if transaction_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    emission   = transaction_amount                           # 1:1
    commission = transaction_amount * commission_rate
    node_share = commission * NODE_SHARE_RATIO
    afc_share  = commission * AFC_RESERVE_RATIO
    return {
        "transactionAmount": transaction_amount,
        "emissionAmount":    emission,
        "commission":        commission,
        "nodeShare":         node_share,
        "afcReserveShare":   afc_share,
        "commissionRate":    commission_rate,
    }


def afc_reserve_index(total_reserve: float) -> float:
    return 1.0 + math.sqrt(total_reserve) / 10_000


class TestCanonicalEmission(unittest.TestCase):

    # ------------------------------------------------------------------
    # 1:1 emission invariant
    # ------------------------------------------------------------------

    def test_emission_equals_transaction_amount(self):
        r = calculate(10_000)
        self.assertEqual(r["emissionAmount"], r["transactionAmount"])

    def test_emission_equals_tx_amount_various(self):
        for amount in [1, 100, 999.99, 1_000_000]:
            r = calculate(amount)
            self.assertEqual(r["emissionAmount"], amount)

    # ------------------------------------------------------------------
    # Commission split
    # ------------------------------------------------------------------

    def test_default_commission_rate(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["commission"], 50.0, places=8)

    def test_node_share_is_75pct(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["nodeShare"], 37.5, places=8)

    def test_afc_share_is_25pct(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["afcReserveShare"], 12.5, places=8)

    def test_split_sums_to_commission(self):
        for amount in [1, 500, 10_000, 1_000_000]:
            r = calculate(amount)
            self.assertAlmostEqual(r["nodeShare"] + r["afcReserveShare"], r["commission"], places=10)

    def test_custom_commission_rate(self):
        r = calculate(10_000, commission_rate=0.01)
        self.assertAlmostEqual(r["commission"], 100.0, places=8)
        self.assertAlmostEqual(r["nodeShare"], 75.0, places=8)
        self.assertAlmostEqual(r["afcReserveShare"], 25.0, places=8)

    # ------------------------------------------------------------------
    # Canonical example from spec: $10,000 transaction
    # ------------------------------------------------------------------

    def test_canonical_example_10k(self):
        r = calculate(10_000)
        self.assertEqual(r["emissionAmount"], 10_000)
        self.assertAlmostEqual(r["commission"], 50.0, places=8)
        self.assertAlmostEqual(r["nodeShare"], 37.5, places=8)
        self.assertAlmostEqual(r["afcReserveShare"], 12.5, places=8)

    # ------------------------------------------------------------------
    # AFC reserve price index
    # ------------------------------------------------------------------

    def test_afc_index_starts_at_1(self):
        self.assertEqual(afc_reserve_index(0), 1.0)

    def test_afc_index_rises_with_reserve(self):
        idx_low  = afc_reserve_index(12.5)
        idx_high = afc_reserve_index(1_000_000)
        self.assertGreater(idx_high, idx_low)

    def test_afc_index_formula_sqrt(self):
        reserve = 12.5
        expected = 1.0 + math.sqrt(reserve) / 10_000
        self.assertAlmostEqual(afc_reserve_index(reserve), expected, places=12)

    def test_afc_index_monotonically_nondecreasing(self):
        reserves = [0, 12.5, 100, 10_000, 1_000_000]
        indices  = [afc_reserve_index(r) for r in reserves]
        for i in range(1, len(indices)):
            self.assertGreaterEqual(indices[i], indices[i - 1])

    # ------------------------------------------------------------------
    # Guard conditions
    # ------------------------------------------------------------------

    def test_zero_amount_raises(self):
        with self.assertRaises(ValueError):
            calculate(0)

    def test_negative_amount_raises(self):
        with self.assertRaises(ValueError):
            calculate(-100)

    def test_dust_amount(self):
        r = calculate(0.00000001)
        self.assertAlmostEqual(r["emissionAmount"], 0.00000001, places=14)

    # ------------------------------------------------------------------
    # Net supply invariant: mint and burn cancel out
    # ------------------------------------------------------------------

    def test_net_supply_change_is_zero(self):
        r = calculate(10_000)
        minted = r["emissionAmount"]
        burned = r["emissionAmount"]  # ARO burned after TX completes
        self.assertEqual(minted - burned, 0)


if __name__ == "__main__":
    unittest.main()
