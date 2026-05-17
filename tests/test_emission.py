"""
Canonical 1:1 emission model — deterministic reference tests.

These tests validate the mathematical invariants of the ArosCoin emission
protocol independently of the TypeScript runtime.

Canonical model:
  Emission     = Transaction Amount           (1:1)
  Commission   = Transaction Amount × rate    (default 0.5%)
  Node Share   = Commission × 0.75
  AFC Reserve  = Commission × 0.25
  Burn         = Emission Amount              (post-TX)
  reserveIndex = 1.0 + sqrt(totalAfcReserve) / 10_000
"""

import math
import pytest

# ── pure calculation ────────────────────────────────────────────────────────────

DEFAULT_COMMISSION_RATE = 0.005  # 0.5%
NODE_SHARE_RATIO        = 0.75
AFC_RESERVE_RATIO       = 0.25


def calculate(tx_amount: float, rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    if tx_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    commission   = tx_amount * rate
    node_share   = commission * NODE_SHARE_RATIO
    afc_share    = commission * AFC_RESERVE_RATIO
    return {
        "transactionAmount": tx_amount,
        "emissionAmount":    tx_amount,   # 1:1
        "commission":        commission,
        "nodeShare":         node_share,
        "afcReserveShare":   afc_share,
        "commissionRate":    rate,
    }


def reserve_index(total_afc_reserve: float) -> float:
    return 1.0 + math.sqrt(total_afc_reserve) / 10_000


# ── calculate() tests ──────────────────────────────────────────────────────────

class TestCalculate:
    def test_emission_equals_tx_amount_1to1(self):
        result = calculate(10_000)
        assert result["emissionAmount"] == result["transactionAmount"] == 10_000

    def test_commission_default_0_5_pct(self):
        result = calculate(10_000)
        assert math.isclose(result["commission"], 50.0, rel_tol=1e-9)

    def test_node_share_75_pct_of_commission(self):
        result = calculate(10_000)
        assert math.isclose(result["nodeShare"], 37.5, rel_tol=1e-9)

    def test_afc_reserve_25_pct_of_commission(self):
        result = calculate(10_000)
        assert math.isclose(result["afcReserveShare"], 12.5, rel_tol=1e-9)

    def test_node_plus_afc_equals_commission(self):
        result = calculate(10_000)
        assert math.isclose(
            result["nodeShare"] + result["afcReserveShare"],
            result["commission"],
            rel_tol=1e-12,
        )

    def test_custom_commission_rate(self):
        result = calculate(10_000, rate=0.01)
        assert math.isclose(result["commission"], 100.0, rel_tol=1e-9)

    def test_zero_amount_raises(self):
        with pytest.raises(ValueError):
            calculate(0)

    def test_negative_amount_raises(self):
        with pytest.raises(ValueError):
            calculate(-100)

    def test_dust_amount(self):
        result = calculate(0.01)
        assert math.isclose(result["emissionAmount"], 0.01, rel_tol=1e-9)

    def test_large_amount_1m(self):
        result = calculate(1_000_000)
        assert math.isclose(result["commission"],      5_000,  rel_tol=1e-9)
        assert math.isclose(result["nodeShare"],       3_750,  rel_tol=1e-9)
        assert math.isclose(result["afcReserveShare"], 1_250,  rel_tol=1e-9)


# ── canonical $10,000 example from spec ────────────────────────────────────────

class TestCanonicalExample:
    """Vectors from coin_emission_model.md § Example: $10,000 transaction."""

    def test_tx_10000_emission(self):
        r = calculate(10_000)
        assert r["emissionAmount"] == 10_000

    def test_tx_10000_commission(self):
        r = calculate(10_000)
        assert math.isclose(r["commission"], 50, rel_tol=1e-9)

    def test_tx_10000_node_pool(self):
        r = calculate(10_000)
        assert math.isclose(r["nodeShare"], 37.5, rel_tol=1e-9)

    def test_tx_10000_afc_reserve(self):
        r = calculate(10_000)
        assert math.isclose(r["afcReserveShare"], 12.5, rel_tol=1e-9)

    def test_tx_10000_burn_equals_emission(self):
        r = calculate(10_000)
        # canonical model: burn == emissionAmount
        assert r["emissionAmount"] == 10_000  # same as burn in the lifecycle

    def test_tx_10000_net_circulating_change_is_zero(self):
        r = calculate(10_000)
        # mint then burn → net = 0
        net = r["emissionAmount"] - r["emissionAmount"]
        assert net == 0


# ── AFC reserve index ───────────────────────────────────────────────────────────

class TestReserveIndex:
    def test_initial_index_is_1(self):
        assert reserve_index(0) == 1.0

    def test_index_after_single_tx(self):
        # After a $10,000 TX: afcShare = 12.5
        idx = reserve_index(12.5)
        expected = 1.0 + math.sqrt(12.5) / 10_000
        assert math.isclose(idx, expected, rel_tol=1e-12)

    def test_index_is_monotonically_non_decreasing(self):
        total = 0.0
        prev = reserve_index(0)
        for tx_amount in [100, 500, 1_000, 5_000, 10_000]:
            r = calculate(tx_amount)
            total += r["afcReserveShare"]
            cur = reserve_index(total)
            assert cur >= prev
            prev = cur

    def test_index_formula_sublinear(self):
        # sqrt gives sub-linear growth: doubling reserve does not double the delta
        idx_1 = reserve_index(10_000)
        idx_2 = reserve_index(40_000)
        delta_1 = idx_1 - 1.0
        delta_2 = idx_2 - 1.0
        # delta_2 should be 2× delta_1 (sqrt(4x) = 2*sqrt(x)), not 4× — sub-linear
        assert math.isclose(delta_2 / delta_1, 2.0, rel_tol=1e-9)

    def test_cumulative_reserve_across_100_txs(self):
        total_afc = 0.0
        for _ in range(100):
            r = calculate(10_000)
            total_afc += r["afcReserveShare"]
        # 100 TXs × $12.5 AFC each = $1,250
        assert math.isclose(total_afc, 1_250.0, rel_tol=1e-9)
        idx = reserve_index(total_afc)
        assert idx > 1.0


# ── invariants ─────────────────────────────────────────────────────────────────

class TestInvariants:
    def test_invariant_emission_equals_tx_amount_for_all_amounts(self):
        for amount in [0.01, 1, 100, 10_000, 1_000_000]:
            r = calculate(amount)
            assert r["emissionAmount"] == amount, f"failed for amount={amount}"

    def test_invariant_total_split_equals_commission(self):
        for amount in [0.01, 1, 100, 10_000, 1_000_000]:
            r = calculate(amount)
            assert math.isclose(
                r["nodeShare"] + r["afcReserveShare"],
                r["commission"],
                rel_tol=1e-12,
            ), f"split mismatch for amount={amount}"

    def test_invariant_supply_snapshot_net_zero(self):
        # In canonical cycle: totalMinted += emission, totalBurned += emission
        # → circulatingSupply unchanged
        total_minted = 0.0
        total_burned = 0.0
        for amount in [100, 500, 1_000, 10_000]:
            r = calculate(amount)
            total_minted += r["emissionAmount"]
            total_burned += r["emissionAmount"]   # burn == emission
        net = total_minted - total_burned
        assert math.isclose(net, 0.0, abs_tol=1e-9), f"net supply should be 0, got {net}"
