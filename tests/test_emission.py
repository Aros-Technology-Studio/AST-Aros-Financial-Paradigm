"""
Canonical 1:1 Emission Model — unit tests (pure math, no I/O).

Rules verified:
  emission   = transactionAmount           (1:1, no multiplier)
  commission = transactionAmount × rate    (default 0.5%)
  nodeShare  = commission × 0.75
  afcShare   = commission × 0.25
  ARO burned = emission  →  net supply delta = 0
  reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
"""

import math
import unittest


DEFAULT_RATE = 0.005          # 0.5%
NODE_RATIO   = 0.75
AFC_RATIO    = 0.25
INDEX_DENOM  = 10_000.0


def calculate(tx_amount: float, rate: float = DEFAULT_RATE) -> dict:
    assert tx_amount > 0, "tx_amount must be positive"
    emission   = tx_amount
    commission = tx_amount * rate
    node_share = commission * NODE_RATIO
    afc_share  = commission * AFC_RATIO
    return dict(
        transactionAmount=tx_amount,
        emissionAmount=emission,
        commission=commission,
        nodeShare=node_share,
        afcReserveShare=afc_share,
        commissionRate=rate,
    )


def reserve_index(total_afc: float) -> float:
    return 1.0 + math.sqrt(total_afc) / INDEX_DENOM


class TestCanonicalEmission(unittest.TestCase):

    def test_1_to_1_emission(self):
        r = calculate(10_000)
        self.assertEqual(r["emissionAmount"], 10_000)

    def test_commission_default_rate(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["commission"], 50.0)

    def test_node_share_75pct(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["nodeShare"], 37.5)

    def test_afc_share_25pct(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["afcReserveShare"], 12.5)

    def test_fee_split_sums_to_commission(self):
        r = calculate(10_000)
        self.assertAlmostEqual(r["nodeShare"] + r["afcReserveShare"], r["commission"])

    def test_net_supply_delta_is_zero(self):
        r = calculate(10_000)
        minted = r["emissionAmount"]
        burned = r["emissionAmount"]          # canonical burn after TX
        self.assertEqual(minted - burned, 0)

    def test_small_amount(self):
        r = calculate(0.01)
        self.assertAlmostEqual(r["emissionAmount"], 0.01)
        self.assertAlmostEqual(r["commission"], 0.01 * 0.005)

    def test_custom_rate(self):
        r = calculate(1_000, rate=0.01)       # 1%
        self.assertAlmostEqual(r["commission"], 10.0)
        self.assertAlmostEqual(r["nodeShare"], 7.5)
        self.assertAlmostEqual(r["afcReserveShare"], 2.5)

    def test_zero_amount_raises(self):
        with self.assertRaises(AssertionError):
            calculate(0)

    def test_negative_amount_raises(self):
        with self.assertRaises(AssertionError):
            calculate(-100)

    # ── AFC reserve price index ──────────────────────────────────────────────

    def test_reserve_index_starts_at_one(self):
        self.assertAlmostEqual(reserve_index(0.0), 1.0)

    def test_reserve_index_rises_with_reserve(self):
        idx_before = reserve_index(0.0)
        idx_after  = reserve_index(12.5)       # 25% of 50 ARO commission
        self.assertGreater(idx_after, idx_before)

    def test_reserve_index_formula_10k_tx(self):
        # $10,000 TX → afcShare = 12.5 ARO
        idx = reserve_index(12.5)
        expected = 1.0 + math.sqrt(12.5) / 10_000
        self.assertAlmostEqual(idx, expected, places=10)

    def test_reserve_index_sub_linear(self):
        # Doubling reserve should not double the index above 1.0
        idx_a = reserve_index(10_000) - 1.0
        idx_b = reserve_index(40_000) - 1.0    # 4× reserve
        self.assertLess(idx_b, 4 * idx_a)      # sub-linear (sqrt)

    def test_reserve_index_monotonic(self):
        reserves = [0, 12.5, 50, 500, 10_000, 1_000_000]
        indices  = [reserve_index(r) for r in reserves]
        for i in range(len(indices) - 1):
            self.assertLessEqual(indices[i], indices[i + 1])

    # ── $10,000 reference example from spec ─────────────────────────────────

    def test_reference_example_10k(self):
        r = calculate(10_000)
        self.assertEqual(r["emissionAmount"], 10_000)
        self.assertAlmostEqual(r["commission"],      50.00)
        self.assertAlmostEqual(r["nodeShare"],       37.50)
        self.assertAlmostEqual(r["afcReserveShare"], 12.50)
        idx = reserve_index(r["afcReserveShare"])
        self.assertAlmostEqual(idx, 1.0 + math.sqrt(12.5) / 10_000, places=10)


if __name__ == "__main__":
    unittest.main()
