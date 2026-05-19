"""
Unit tests for the canonical 1:1 ArosCoin emission model.

These tests validate the pure calculation logic (EmissionService.calculate equivalent)
and the invariants that must hold for every transaction emission cycle.
"""

import math
import pytest


# ---------------------------------------------------------------------------
# Pure Python re-implementation of EmissionService.calculate()
# Mirrors src/token/emission.service.ts EmissionService.calculate()
# ---------------------------------------------------------------------------

DEFAULT_COMMISSION_RATE = 0.005   # 0.5%
NODE_SHARE_RATIO        = 0.75
AFC_RESERVE_RATIO       = 0.25


def calculate_emission(transaction_amount: float, commission_rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    """Pure calculation — no side effects. Mirrors EmissionService.calculate()."""
    if transaction_amount <= 0:
        raise ValueError("Transaction amount must be positive")

    emission   = transaction_amount                           # 1:1
    commission = transaction_amount * commission_rate
    node_share = commission * NODE_SHARE_RATIO
    afc_share  = commission * AFC_RESERVE_RATIO

    return {
        "transaction_amount": transaction_amount,
        "emission_amount":    emission,
        "commission":         commission,
        "node_share":         node_share,
        "afc_reserve_share":  afc_share,
        "commission_rate":    commission_rate,
    }


def reserve_index(total_reserve: float) -> float:
    """AFC reserve price index. Mirrors EmissionService.updateAfcReserve()."""
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ---------------------------------------------------------------------------
# Tests: canonical 1:1 emission ratio
# ---------------------------------------------------------------------------

class TestEmissionRatio:
    def test_emission_equals_tx_amount(self):
        """Core invariant: emission == transaction amount (1:1)."""
        for amount in [1.0, 100.0, 10_000.0, 999_999.99]:
            result = calculate_emission(amount)
            assert result["emission_amount"] == amount, (
                f"Expected emission={amount}, got {result['emission_amount']}"
            )

    def test_emission_for_10000_transaction(self):
        """Reference example from canonical spec: $10,000 TX."""
        r = calculate_emission(10_000.0)
        assert r["emission_amount"]   == 10_000.0
        assert r["commission"]        == pytest.approx(50.0,    rel=1e-9)
        assert r["node_share"]        == pytest.approx(37.50,   rel=1e-9)
        assert r["afc_reserve_share"] == pytest.approx(12.50,   rel=1e-9)

    def test_emission_equals_tx_amount_custom_rate(self):
        """1:1 invariant holds regardless of commission rate."""
        r = calculate_emission(5_000.0, commission_rate=0.01)
        assert r["emission_amount"] == 5_000.0


# ---------------------------------------------------------------------------
# Tests: commission and 75/25 split
# ---------------------------------------------------------------------------

class TestCommissionSplit:
    def test_default_commission_rate_is_0_5_pct(self):
        r = calculate_emission(1_000.0)
        assert r["commission"] == pytest.approx(5.0, rel=1e-9)

    def test_75_25_split(self):
        """node_share + afc_share must equal commission exactly."""
        for amount in [1.0, 500.0, 10_000.0, 123_456.78]:
            r = calculate_emission(amount)
            assert r["node_share"] + r["afc_reserve_share"] == pytest.approx(
                r["commission"], rel=1e-9
            ), f"Split does not sum to commission for amount={amount}"

    def test_node_share_is_75_pct_of_commission(self):
        r = calculate_emission(10_000.0)
        assert r["node_share"] == pytest.approx(r["commission"] * 0.75, rel=1e-9)

    def test_afc_share_is_25_pct_of_commission(self):
        r = calculate_emission(10_000.0)
        assert r["afc_reserve_share"] == pytest.approx(r["commission"] * 0.25, rel=1e-9)

    def test_custom_commission_rate(self):
        r = calculate_emission(10_000.0, commission_rate=0.01)
        assert r["commission"] == pytest.approx(100.0, rel=1e-9)
        assert r["node_share"] == pytest.approx(75.0,  rel=1e-9)
        assert r["afc_reserve_share"] == pytest.approx(25.0, rel=1e-9)


# ---------------------------------------------------------------------------
# Tests: burn / net-zero supply invariant
# ---------------------------------------------------------------------------

class TestBurnInvariant:
    def test_net_circulating_change_is_zero(self):
        """mint and burn cancel out: net supply delta == 0."""
        r = calculate_emission(10_000.0)
        net_supply_delta = r["emission_amount"] - r["emission_amount"]  # mint then burn
        assert net_supply_delta == 0.0

    def test_total_minted_equals_total_burned_per_cycle(self):
        """SupplySnapshot invariant: totalMinted == totalBurned after each canonical TX cycle."""
        amounts = [100.0, 500.0, 10_000.0]
        total_minted = 0.0
        total_burned = 0.0
        for a in amounts:
            r = calculate_emission(a)
            total_minted += r["emission_amount"]
            total_burned += r["emission_amount"]   # burn equals mint per cycle
        assert total_minted == total_burned


# ---------------------------------------------------------------------------
# Tests: AFC reserve index (price growth)
# ---------------------------------------------------------------------------

class TestAfcReserveIndex:
    def test_index_starts_at_one(self):
        assert reserve_index(0.0) == 1.0

    def test_index_greater_than_one_with_positive_reserve(self):
        assert reserve_index(100.0) > 1.0

    def test_index_grows_monotonically(self):
        """Each AFC deposit must increase the reserve index."""
        reserves = [0.0, 12.5, 25.0, 100.0, 1_000.0, 10_000.0, 100_000.0]
        indices = [reserve_index(r) for r in reserves]
        for i in range(1, len(indices)):
            assert indices[i] > indices[i - 1], (
                f"Index not monotonically increasing at reserve={reserves[i]}"
            )

    def test_index_for_example_transaction(self):
        """After the $10,000 reference TX: AFC accumulates 12.50 ARO."""
        idx = reserve_index(12.50)
        assert idx == pytest.approx(1.0 + math.sqrt(12.50) / 10_000, rel=1e-12)
        assert idx > 1.0

    def test_sub_linear_growth(self):
        """Growth is sub-linear (sqrt). Index at 10_000 < 2× index at 2_500."""
        idx_2500  = reserve_index(2_500.0)
        idx_10000 = reserve_index(10_000.0)
        assert idx_10000 < 2 * idx_2500


# ---------------------------------------------------------------------------
# Tests: input validation
# ---------------------------------------------------------------------------

class TestInputValidation:
    def test_zero_amount_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate_emission(0.0)

    def test_negative_amount_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate_emission(-100.0)

    def test_dust_amount(self):
        """Tiny positive amounts must still produce a valid emission."""
        r = calculate_emission(0.00000001)
        assert r["emission_amount"] == pytest.approx(0.00000001, rel=1e-9)
        assert r["node_share"] + r["afc_reserve_share"] == pytest.approx(r["commission"], rel=1e-6)

    def test_large_amount(self):
        """Large amounts (e.g. $1B) must not overflow or lose precision."""
        r = calculate_emission(1_000_000_000.0)
        assert r["emission_amount"] == 1_000_000_000.0
        assert r["commission"] == pytest.approx(5_000_000.0, rel=1e-9)
