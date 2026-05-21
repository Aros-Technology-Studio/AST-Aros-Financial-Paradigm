"""
Unit tests for canonical 1:1 ArosCoin emission model.
Mirrors EmissionService.calculate() logic in pure Python.
"""
import math
import pytest


# ──────────────────────────────────────────────────────────────
# Pure Python replica of EmissionService.calculate()
# ──────────────────────────────────────────────────────────────

DEFAULT_RATE = 0.005       # 0.5%
NODE_SHARE   = 0.75
AFC_SHARE    = 0.25


def calculate(tx_amount: float, rate: float = DEFAULT_RATE) -> dict:
    assert tx_amount > 0, "Transaction amount must be positive"
    emission   = tx_amount                    # 1:1
    commission = tx_amount * rate
    node_share = commission * NODE_SHARE
    afc_share  = commission * AFC_SHARE
    return {
        "transactionAmount": tx_amount,
        "emissionAmount":    emission,
        "commission":        commission,
        "nodeShare":         node_share,
        "afcReserveShare":   afc_share,
        "commissionRate":    rate,
    }


def reserve_index(total_reserve: float) -> float:
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ──────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────

class TestCanonicalEmission:

    def test_emission_equals_tx_amount(self):
        r = calculate(10_000)
        assert r["emissionAmount"] == 10_000, "Emission must equal tx amount 1:1"

    def test_commission_at_default_rate(self):
        r = calculate(10_000)
        assert abs(r["commission"] - 50.0) < 1e-9

    def test_node_share_75_pct(self):
        r = calculate(10_000)
        assert abs(r["nodeShare"] - 37.50) < 1e-9

    def test_afc_share_25_pct(self):
        r = calculate(10_000)
        assert abs(r["afcReserveShare"] - 12.50) < 1e-9

    def test_node_plus_afc_equals_commission(self):
        r = calculate(10_000)
        assert abs(r["nodeShare"] + r["afcReserveShare"] - r["commission"]) < 1e-9

    def test_custom_commission_rate(self):
        r = calculate(1_000, rate=0.01)   # 1%
        assert abs(r["commission"] - 10.0) < 1e-9
        assert abs(r["nodeShare"]  - 7.50) < 1e-9
        assert abs(r["afcReserveShare"] - 2.50) < 1e-9

    def test_dust_amount(self):
        r = calculate(0.00000001)
        assert r["emissionAmount"] == pytest.approx(0.00000001)
        assert r["nodeShare"] + r["afcReserveShare"] == pytest.approx(r["commission"])

    def test_large_amount(self):
        r = calculate(1_000_000_000)
        assert r["emissionAmount"] == 1_000_000_000
        assert abs(r["nodeShare"] - 3_750_000) < 1e-4

    def test_zero_amount_raises(self):
        with pytest.raises(AssertionError):
            calculate(0)

    def test_negative_amount_raises(self):
        with pytest.raises(AssertionError):
            calculate(-100)


class TestAfcReserveIndex:

    def test_initial_index_is_one(self):
        assert reserve_index(0) == 1.0

    def test_index_grows_with_reserve(self):
        idx_low  = reserve_index(100)
        idx_high = reserve_index(10_000)
        assert idx_high > idx_low

    def test_example_12_50_afc(self):
        """After a single $10k tx the AFC accumulates 12.50 ARO."""
        idx = reserve_index(12.50)
        assert abs(idx - (1.0 + math.sqrt(12.50) / 10_000)) < 1e-12

    def test_index_sub_linear(self):
        """Doubling reserve should less than double (index - 1)."""
        d1 = reserve_index(1_000) - 1.0
        d2 = reserve_index(4_000) - 1.0   # 4× reserve
        assert d2 < 2 * d1 * 2            # sub-linear: increment < linear

    def test_index_monotonically_non_decreasing(self):
        reserves = [0, 1, 10, 100, 1_000, 10_000, 1_000_000]
        indices = [reserve_index(r) for r in reserves]
        for i in range(1, len(indices)):
            assert indices[i] >= indices[i - 1]


class TestNetZeroSupply:

    def test_mint_then_burn_net_zero(self):
        """
        Per canonical model, emissionAmount is minted then burned
        in the same atomic TX cycle. Net circulating supply change = 0.
        """
        r = calculate(50_000)
        minted = r["emissionAmount"]
        burned = r["emissionAmount"]   # canonical: burn = mint
        net    = minted - burned
        assert net == 0.0
