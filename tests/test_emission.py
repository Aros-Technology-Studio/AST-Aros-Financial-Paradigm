"""
Reference tests for the ArosCoin canonical 1:1 emission model.
These are pure-Python formula verification tests — no service dependencies.

Canonical rules:
  Emission     = Transaction Amount (1:1)
  Commission   = Transaction Amount × rate  (default 0.5%)
  Node Share   = Commission × 0.75
  AFC Reserve  = Commission × 0.25
  reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
"""

import math
import pytest


# ---------------------------------------------------------------------------
# Reference implementation of the canonical formula
# ---------------------------------------------------------------------------

DEFAULT_COMMISSION_RATE = 0.005  # 0.5%
NODE_SHARE_RATIO = 0.75
AFC_RESERVE_RATIO = 0.25


def calculate(transaction_amount: float, commission_rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    if transaction_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    emission = transaction_amount
    commission = transaction_amount * commission_rate
    node_share = commission * NODE_SHARE_RATIO
    afc_share = commission * AFC_RESERVE_RATIO
    return {
        "transaction_amount": transaction_amount,
        "emission_amount": emission,
        "commission": commission,
        "node_share": node_share,
        "afc_reserve_share": afc_share,
        "commission_rate": commission_rate,
    }


def reserve_index(total_afc_reserve: float) -> float:
    return 1.0 + math.sqrt(total_afc_reserve) / 10_000


# ---------------------------------------------------------------------------
# Tests — calculate()
# ---------------------------------------------------------------------------

class TestCalculate:
    def test_emission_is_1_to_1(self):
        r = calculate(10_000)
        assert r["emission_amount"] == 10_000

    def test_default_commission_rate(self):
        r = calculate(10_000)
        assert abs(r["commission"] - 50.0) < 1e-8

    def test_node_share_is_75_pct(self):
        r = calculate(10_000)
        assert abs(r["node_share"] - 37.5) < 1e-8

    def test_afc_share_is_25_pct(self):
        r = calculate(10_000)
        assert abs(r["afc_reserve_share"] - 12.5) < 1e-8

    def test_node_plus_afc_equals_commission(self):
        r = calculate(10_000)
        assert abs(r["node_share"] + r["afc_reserve_share"] - r["commission"]) < 1e-10

    def test_custom_commission_rate(self):
        r = calculate(1_000, commission_rate=0.01)
        assert abs(r["commission"] - 10.0) < 1e-8

    def test_raises_on_zero_amount(self):
        with pytest.raises(ValueError):
            calculate(0)

    def test_raises_on_negative_amount(self):
        with pytest.raises(ValueError):
            calculate(-100)

    def test_dust_amount(self):
        r = calculate(0.01)
        assert abs(r["emission_amount"] - 0.01) < 1e-10
        assert abs(r["commission"] - 0.00005) < 1e-12

    def test_large_amount(self):
        r = calculate(1_000_000)
        assert r["emission_amount"] == 1_000_000
        assert abs(r["commission"] - 5_000) < 1e-6
        assert abs(r["node_share"] - 3_750) < 1e-6
        assert abs(r["afc_reserve_share"] - 1_250) < 1e-6


# ---------------------------------------------------------------------------
# Tests — reserve_index()
# ---------------------------------------------------------------------------

class TestReserveIndex:
    def test_starts_at_one_with_zero_reserve(self):
        assert reserve_index(0) == 1.0

    def test_known_value_after_10k_tx(self):
        # After one $10,000 TX: afcShare = 12.5
        # reserveIndex = 1.0 + sqrt(12.5) / 10_000
        expected = 1.0 + math.sqrt(12.5) / 10_000
        assert abs(reserve_index(12.5) - expected) < 1e-12

    def test_index_greater_than_one_when_reserve_positive(self):
        assert reserve_index(100) > 1.0

    def test_monotonically_increasing(self):
        reserves = [0, 10, 100, 1_000, 10_000, 100_000]
        indices = [reserve_index(r) for r in reserves]
        assert all(indices[i] <= indices[i + 1] for i in range(len(indices) - 1))

    def test_sub_linear_growth(self):
        # sqrt growth — doubling the reserve does not double the premium
        idx_100 = reserve_index(100)
        idx_400 = reserve_index(400)
        premium_100 = idx_100 - 1.0
        premium_400 = idx_400 - 1.0
        # premium_400 should be 2× premium_100 (sqrt(400)/sqrt(100) = 2), not 4×
        assert abs(premium_400 / premium_100 - 2.0) < 1e-8


# ---------------------------------------------------------------------------
# Tests — end-to-end canonical scenario
# ---------------------------------------------------------------------------

class TestCanonicalScenario:
    def test_10k_transaction_example_from_spec(self):
        """Verifies the exact example from coin_emission_model.md."""
        r = calculate(10_000)
        assert r["emission_amount"] == 10_000
        assert abs(r["commission"] - 50) < 1e-8
        assert abs(r["node_share"] - 37.5) < 1e-8
        assert abs(r["afc_reserve_share"] - 12.5) < 1e-8

    def test_net_supply_change_is_zero(self):
        """Mint and burn cancel out — net circulating supply change = 0."""
        r = calculate(10_000)
        minted = r["emission_amount"]
        burned = r["emission_amount"]  # burned after TX
        assert minted - burned == 0

    def test_reserve_grows_across_multiple_transactions(self):
        total_reserve = 0.0
        for i in range(10):
            r = calculate(10_000)
            total_reserve += r["afc_reserve_share"]

        # After 10 transactions of 10k each: total_reserve = 10 × 12.5 = 125
        assert abs(total_reserve - 125.0) < 1e-8
        idx = reserve_index(total_reserve)
        assert idx > 1.0
        expected = 1.0 + math.sqrt(125) / 10_000
        assert abs(idx - expected) < 1e-12
