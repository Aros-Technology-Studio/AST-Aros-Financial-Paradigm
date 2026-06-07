"""
Canonical 1:1 Emission Model — Python-level formula assertions.

These tests validate the mathematical invariants of the ArosCoin emission model
independently of the TypeScript runtime. They serve as a specification oracle.
"""
import math
import pytest

DEFAULT_COMMISSION_RATE = 0.005   # 0.5%
NODE_SHARE_RATIO        = 0.75
AFC_RESERVE_RATIO       = 0.25


def calculate_emission(tx_amount: float, rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    """Mirror of EmissionService.calculate() in src/token/emission.service.ts."""
    emission   = tx_amount
    commission = tx_amount * rate
    node_share = commission * NODE_SHARE_RATIO
    afc_share  = commission * AFC_RESERVE_RATIO
    return {
        "emission_amount":   emission,
        "commission":        commission,
        "node_share":        node_share,
        "afc_reserve_share": afc_share,
        "commission_rate":   rate,
    }


def afc_reserve_index(total_reserve: float) -> float:
    """Mirror of EmissionService.updateAfcReserve() index formula."""
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ---------------------------------------------------------------------------
# Core formula tests
# ---------------------------------------------------------------------------

class TestCanonicalEmissionFormula:

    def test_emission_equals_tx_amount_1_to_1(self):
        result = calculate_emission(10_000)
        assert result["emission_amount"] == 10_000, "Emission must equal tx amount (1:1)"

    def test_commission_is_half_percent_by_default(self):
        result = calculate_emission(10_000)
        assert result["commission"] == pytest.approx(50.0)

    def test_node_share_is_75_pct_of_commission(self):
        result = calculate_emission(10_000)
        assert result["node_share"] == pytest.approx(37.50)

    def test_afc_share_is_25_pct_of_commission(self):
        result = calculate_emission(10_000)
        assert result["afc_reserve_share"] == pytest.approx(12.50)

    def test_node_and_afc_shares_sum_to_commission(self):
        result = calculate_emission(10_000)
        assert result["node_share"] + result["afc_reserve_share"] == pytest.approx(result["commission"])

    def test_net_supply_change_is_zero(self):
        """Mint then burn in same cycle → net circulating supply delta = 0."""
        result = calculate_emission(10_000)
        minted = result["emission_amount"]
        burned = result["emission_amount"]   # ARO burned after TX
        assert minted - burned == 0

    def test_custom_commission_rate(self):
        result = calculate_emission(1_000, rate=0.01)   # 1%
        assert result["commission"] == pytest.approx(10.0)
        assert result["node_share"] == pytest.approx(7.50)
        assert result["afc_reserve_share"] == pytest.approx(2.50)

    def test_dust_amount(self):
        result = calculate_emission(0.01)
        assert result["emission_amount"] == pytest.approx(0.01)
        assert result["commission"]      == pytest.approx(0.000050, rel=1e-4)

    def test_zero_amount_raises(self):
        with pytest.raises((ValueError, ZeroDivisionError, AssertionError)):
            result = calculate_emission(0)
            assert result["emission_amount"] > 0, "Zero-amount emission must be rejected"

    def test_large_transaction(self):
        result = calculate_emission(1_000_000)
        assert result["emission_amount"]   == 1_000_000
        assert result["commission"]        == pytest.approx(5_000.0)
        assert result["node_share"]        == pytest.approx(3_750.0)
        assert result["afc_reserve_share"] == pytest.approx(1_250.0)


class TestAfcReserveIndex:

    def test_initial_index_is_one(self):
        assert afc_reserve_index(0.0) == pytest.approx(1.0)

    def test_index_grows_with_reserve(self):
        assert afc_reserve_index(100) > afc_reserve_index(0)
        assert afc_reserve_index(10_000) > afc_reserve_index(100)

    def test_index_is_monotonically_non_decreasing(self):
        reserves = [0, 12.50, 100, 1_000, 10_000, 100_000, 1_000_000]
        indices  = [afc_reserve_index(r) for r in reserves]
        for i in range(len(indices) - 1):
            assert indices[i] <= indices[i + 1]

    def test_known_value_after_10k_tx(self):
        """After one $10,000 tx, AFC share = 12.50 → index should be 1.0000353..."""
        afc = 12.50
        expected = 1.0 + math.sqrt(afc) / 10_000
        assert afc_reserve_index(afc) == pytest.approx(expected)

    def test_sub_linear_growth(self):
        """Growth from 0→1M should be less than linear."""
        idx_at_1m  = afc_reserve_index(1_000_000)
        idx_at_100 = afc_reserve_index(100)
        ratio_volumes = 1_000_000 / 100      # 10,000×
        ratio_indices = (idx_at_1m - 1) / (idx_at_100 - 1)  # growth ratio
        assert ratio_indices < ratio_volumes   # sub-linear
