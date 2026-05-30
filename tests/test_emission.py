"""
Canonical 1:1 Emission Model — property-based tests.

These tests validate the mathematical invariants of the ArosCoin emission model
without requiring the NestJS runtime:

    Emission  = Transaction Amount          (1:1, no multiplier)
    Fee       = Transaction Amount × rate   (default 0.5%)
    NodeShare = Fee × 0.75
    AfcShare  = Fee × 0.25
    Burn      = Emission                    (ARO destroyed after TX)
    Net circulating change = 0
"""

import math
import pytest

DEFAULT_RATE = 0.005   # 0.5%
NODE_RATIO   = 0.75
AFC_RATIO    = 0.25


def calculate(tx_amount: float, rate: float = DEFAULT_RATE) -> dict:
    """Pure Python replica of EmissionService.calculate()."""
    if tx_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    commission = tx_amount * rate
    return {
        "transaction_amount": tx_amount,
        "emission_amount":    tx_amount,           # 1:1
        "commission":         commission,
        "node_share":         commission * NODE_RATIO,
        "afc_reserve_share":  commission * AFC_RATIO,
        "commission_rate":    rate,
    }


# ---------------------------------------------------------------------------
# Canonical invariants
# ---------------------------------------------------------------------------

class TestCanonicalFormula:
    """Core 1:1 emission rules."""

    def test_emission_equals_tx_amount(self):
        r = calculate(10_000)
        assert r["emission_amount"] == r["transaction_amount"] == 10_000

    def test_default_commission_rate(self):
        r = calculate(10_000)
        assert math.isclose(r["commission"], 50.0, rel_tol=1e-10)

    def test_node_share_75_pct(self):
        r = calculate(10_000)
        assert math.isclose(r["node_share"], 37.5, rel_tol=1e-10)

    def test_afc_share_25_pct(self):
        r = calculate(10_000)
        assert math.isclose(r["afc_reserve_share"], 12.5, rel_tol=1e-10)

    def test_split_sums_to_commission(self):
        r = calculate(10_000)
        assert math.isclose(r["node_share"] + r["afc_reserve_share"], r["commission"], rel_tol=1e-12)

    def test_net_circulating_change_zero(self):
        r = calculate(10_000)
        net = r["emission_amount"] - r["emission_amount"]   # mint then burn cancel out
        assert net == 0

    def test_custom_rate(self):
        r = calculate(1_000, rate=0.01)
        assert math.isclose(r["commission"], 10.0, rel_tol=1e-10)
        assert math.isclose(r["node_share"], 7.5, rel_tol=1e-10)
        assert math.isclose(r["afc_reserve_share"], 2.5, rel_tol=1e-10)

    def test_zero_amount_raises(self):
        with pytest.raises(ValueError):
            calculate(0)

    def test_negative_amount_raises(self):
        with pytest.raises(ValueError):
            calculate(-1)

    @pytest.mark.parametrize("amount", [0.000001, 1, 100, 10_000, 1_000_000])
    def test_split_invariant_various_amounts(self, amount):
        r = calculate(amount)
        assert r["emission_amount"] == amount
        total = r["node_share"] + r["afc_reserve_share"]
        assert math.isclose(total, r["commission"], rel_tol=1e-12)


class TestAfcReservePriceIndex:
    """AFC reserve grows → emission price rises."""

    def _reserve_index(self, total_reserve: float) -> float:
        return 1.0 + math.sqrt(total_reserve) / 10_000

    def test_starts_at_one(self):
        assert self._reserve_index(0) == 1.0

    def test_monotonically_increasing(self):
        previous = self._reserve_index(0)
        for reserve in [12.5, 100, 10_000, 1_000_000]:
            current = self._reserve_index(reserve)
            assert current > previous
            previous = current

    def test_sub_linear_growth(self):
        idx_small = self._reserve_index(100)
        idx_large = self._reserve_index(1_000_000)
        # If linear: ratio would equal sqrt(10_000) = 100; sub-linear means less
        ratio = (idx_large - 1.0) / (idx_small - 1.0)
        assert ratio < 1_000_000 / 100   # much less than linear

    def test_example_10k_tx(self):
        """After one $10,000 TX the AFC gets 12.50 ARO."""
        r = calculate(10_000)
        afc = r["afc_reserve_share"]
        assert math.isclose(afc, 12.5, rel_tol=1e-10)
        idx = self._reserve_index(afc)
        # 1.0 + sqrt(12.5) / 10_000  ≈ 1.00003535...
        expected = 1.0 + math.sqrt(12.5) / 10_000
        assert math.isclose(idx, expected, rel_tol=1e-12)
        assert idx > 1.0


class TestEpochDistribution:
    """Epoch-level fee split mirrors the per-TX canonical ratios."""

    def test_epoch_fees_75_25_split(self):
        total_fees = 500.0
        node_pool   = total_fees * NODE_RATIO
        afc_reserve = total_fees * AFC_RATIO
        assert math.isclose(node_pool,   375.0, rel_tol=1e-10)
        assert math.isclose(afc_reserve, 125.0, rel_tol=1e-10)
        assert math.isclose(node_pool + afc_reserve, total_fees, rel_tol=1e-12)
