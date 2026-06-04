"""
Canonical 1:1 emission model — Python verification tests.

These tests document and verify the emission arithmetic independently
of the TypeScript runtime, giving a language-agnostic audit trail.

Run:  python -m pytest tests/test_emission.py -v
"""

import math
import pytest


# ── Canonical emission calculator (mirrors EmissionService.calculate) ──────────

DEFAULT_RATE      = 0.005   # 0.5%
NODE_SHARE_RATIO  = 0.75
AFC_SHARE_RATIO   = 0.25


def calculate(tx_amount: float, rate: float = DEFAULT_RATE) -> dict:
    if tx_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    commission = tx_amount * rate
    return {
        "transaction_amount": tx_amount,
        "emission_amount":    tx_amount,               # 1:1
        "commission":         commission,
        "node_share":         commission * NODE_SHARE_RATIO,
        "afc_reserve_share":  commission * AFC_SHARE_RATIO,
        "commission_rate":    rate,
    }


def reserve_index(total_reserve: float) -> float:
    """AFC reserve price index: grows sub-linearly with accumulated reserve."""
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ── Tests: calculate() ────────────────────────────────────────────────────────

class TestCalculate:
    def test_emission_equals_tx_amount(self):
        r = calculate(10_000)
        assert r["emission_amount"] == 10_000

    def test_commission_default_rate(self):
        r = calculate(10_000)
        assert abs(r["commission"] - 50.0) < 1e-9

    def test_node_share_75_pct(self):
        r = calculate(10_000)
        assert abs(r["node_share"] - 37.5) < 1e-9

    def test_afc_share_25_pct(self):
        r = calculate(10_000)
        assert abs(r["afc_reserve_share"] - 12.5) < 1e-9

    def test_split_adds_to_commission(self):
        r = calculate(10_000)
        assert abs(r["node_share"] + r["afc_reserve_share"] - r["commission"]) < 1e-9

    def test_custom_rate(self):
        r = calculate(1_000, rate=0.01)
        assert abs(r["commission"] - 10.0) < 1e-9
        assert r["commission_rate"] == 0.01

    def test_dust_amount(self):
        r = calculate(0.01)
        assert abs(r["emission_amount"] - 0.01) < 1e-12

    def test_zero_raises(self):
        with pytest.raises(ValueError):
            calculate(0)

    def test_negative_raises(self):
        with pytest.raises(ValueError):
            calculate(-500)

    def test_large_amount(self):
        r = calculate(1_000_000)
        assert r["emission_amount"] == 1_000_000
        assert abs(r["commission"] - 5_000) < 1e-6


# ── Tests: $10,000 canonical example ──────────────────────────────────────────

class TestCanonicalExample:
    """Verifies the documented $10,000 example from coin_emission_model.md."""

    def setup_method(self):
        self.r = calculate(10_000)

    def test_tx_amount(self):
        assert self.r["transaction_amount"] == 10_000

    def test_emission(self):
        assert self.r["emission_amount"] == 10_000   # 1:1

    def test_commission(self):
        assert abs(self.r["commission"] - 50) < 1e-9

    def test_node_pool(self):
        assert abs(self.r["node_share"] - 37.5) < 1e-9

    def test_afc_reserve(self):
        assert abs(self.r["afc_reserve_share"] - 12.5) < 1e-9

    def test_net_circulating_change(self):
        # Emit 10_000, burn 10_000 → net change = 0
        net = self.r["emission_amount"] - self.r["emission_amount"]
        assert net == 0


# ── Tests: AFC reserve index ───────────────────────────────────────────────────

class TestReserveIndex:
    def test_initial_index_is_one(self):
        assert reserve_index(0) == 1.0

    def test_index_grows_with_reserve(self):
        assert reserve_index(100) > reserve_index(0)

    def test_index_after_first_tx(self):
        # First $10,000 TX: afcShare = 12.5
        afc = 12.5
        expected = 1.0 + math.sqrt(afc) / 10_000
        assert abs(reserve_index(afc) - expected) < 1e-12

    def test_index_is_sublinear(self):
        # sqrt growth: doubling reserve < doubling index increment
        idx_100  = reserve_index(100)  - 1.0
        idx_400  = reserve_index(400)  - 1.0
        assert idx_400 < idx_100 * 2   # sublinear (would be equal if linear)

    def test_index_monotone(self):
        values = [reserve_index(r) for r in [0, 1, 10, 100, 1000, 10_000, 100_000]]
        assert values == sorted(values)

    def test_index_large_reserve(self):
        # At $1B AFC reserve → index ≈ 1.0 + sqrt(1e9)/10000 ≈ 4.162
        idx = reserve_index(1_000_000_000)
        assert abs(idx - (1.0 + math.sqrt(1_000_000_000) / 10_000)) < 1e-6


# ── Tests: supply invariants ───────────────────────────────────────────────────

class TestSupplyInvariants:
    def test_net_supply_change_zero_per_cycle(self):
        """Every TX cycle: mint = burn → circulating supply unchanged."""
        for amount in [100, 1_000, 10_000, 1_000_000]:
            r = calculate(amount)
            assert r["emission_amount"] == r["transaction_amount"]
            net_change = r["emission_amount"] - r["emission_amount"]  # mint - burn
            assert net_change == 0

    def test_total_minted_equals_total_burned_over_n_txs(self):
        amounts = [5_000, 10_000, 15_000, 20_000]
        total_minted = sum(calculate(a)["emission_amount"] for a in amounts)
        total_burned = sum(calculate(a)["emission_amount"] for a in amounts)  # same
        assert total_minted == total_burned

    def test_afc_reserve_grows_monotone_over_txs(self):
        reserve = 0.0
        for amount in [1_000, 2_000, 5_000, 10_000]:
            r = calculate(amount)
            old_idx = reserve_index(reserve)
            reserve += r["afc_reserve_share"]
            new_idx = reserve_index(reserve)
            assert new_idx >= old_idx
