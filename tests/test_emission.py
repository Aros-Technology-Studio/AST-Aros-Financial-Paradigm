"""
Canonical 1:1 Emission Model — unit tests.

Mirrors the logic in src/token/emission.service.ts so we can
verify the formulas independently without a running NestJS server.

Canonical rules (src/token/emission.service.ts):
  emission       = tx_amount                          (1:1)
  commission     = tx_amount * rate                   (default 0.5%)
  node_share     = commission * 0.75                  (75%)
  afc_share      = commission * 0.25                  (25%)
  burn_amount    = emission_amount                    (full emission burned)
  net_supply_Δ   = 0 per TX cycle                    (mint and burn cancel out)
  reserve_index  = 1.0 + sqrt(total_afc_reserve) / 10_000

Ref: emission.service.ts burns `result.emissionAmount` in full (step 4).
     SupplySnapshot records totalMinted == totalBurned → circulatingSupply unchanged.
"""

import math
import pytest


# ---------------------------------------------------------------------------
# Pure-Python mirror of EmissionService.calculate() + updateAfcReserve()
# ---------------------------------------------------------------------------

DEFAULT_COMMISSION_RATE = 0.005  # 0.5%
NODE_SHARE_RATIO        = 0.75
AFC_RESERVE_RATIO       = 0.25


def calculate(tx_amount: float, rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    if tx_amount <= 0:
        raise ValueError("Transaction amount must be positive")

    emission   = tx_amount
    commission = tx_amount * rate
    node_share = commission * NODE_SHARE_RATIO
    afc_share  = commission * AFC_RESERVE_RATIO

    return {
        "transaction_amount": tx_amount,
        "emission_amount":    emission,       # 1:1
        "commission":         commission,
        "node_share":         node_share,
        "afc_reserve_share":  afc_share,
        "burn_amount":        emission,       # full emission burned (canonical)
        "commission_rate":    rate,
    }


def reserve_index(total_afc_reserve: float) -> float:
    """AFC reserve price index — rises monotonically as reserve accumulates."""
    return 1.0 + math.sqrt(total_afc_reserve) / 10_000


# ---------------------------------------------------------------------------
# 1:1 Emission
# ---------------------------------------------------------------------------

class TestCalculate:
    def test_1_to_1_emission(self):
        r = calculate(10_000)
        assert r["emission_amount"] == 10_000, "Emission must equal transaction amount (1:1)"

    def test_default_commission_rate(self):
        r = calculate(10_000)
        assert r["commission"] == pytest.approx(50.0), "Commission = 10_000 × 0.005 = 50"

    def test_node_share_75_percent(self):
        r = calculate(10_000)
        assert r["node_share"] == pytest.approx(37.5), "Node share = 50 × 0.75 = 37.50"

    def test_afc_share_25_percent(self):
        r = calculate(10_000)
        assert r["afc_reserve_share"] == pytest.approx(12.5), "AFC share = 50 × 0.25 = 12.50"

    def test_commission_split_sums_to_commission(self):
        r = calculate(10_000)
        assert r["node_share"] + r["afc_reserve_share"] == pytest.approx(r["commission"])

    def test_burn_equals_full_emission_amount(self):
        r = calculate(10_000)
        # Canonical: full emission is burned, not (emission - commission)
        assert r["burn_amount"] == pytest.approx(r["emission_amount"])
        assert r["burn_amount"] == pytest.approx(10_000.0)

    def test_custom_commission_rate(self):
        r = calculate(10_000, rate=0.01)
        assert r["commission"]        == pytest.approx(100.0), "1% of 10_000 = 100"
        assert r["node_share"]        == pytest.approx(75.0)
        assert r["afc_reserve_share"] == pytest.approx(25.0)
        assert r["burn_amount"]       == pytest.approx(10_000.0)  # still full emission

    def test_small_transaction(self):
        r = calculate(1.0)
        assert r["emission_amount"]   == pytest.approx(1.0)
        assert r["commission"]        == pytest.approx(0.005)
        assert r["node_share"]        == pytest.approx(0.00375)
        assert r["afc_reserve_share"] == pytest.approx(0.00125)
        assert r["burn_amount"]       == pytest.approx(1.0)  # full emission burned

    def test_fractional_amount(self):
        r = calculate(0.00000001)  # 1 satoshi equivalent
        assert r["emission_amount"] == pytest.approx(0.00000001)

    def test_zero_amount_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate(0)

    def test_negative_amount_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate(-100)

    def test_large_amount(self):
        r = calculate(1_000_000_000)
        assert r["emission_amount"] == pytest.approx(1_000_000_000)
        assert r["commission"]      == pytest.approx(5_000_000)
        assert r["burn_amount"]     == pytest.approx(1_000_000_000)


# ---------------------------------------------------------------------------
# Net circulating supply invariant
# ---------------------------------------------------------------------------

class TestNetSupply:
    """
    Canonical invariant: burn_amount == emission_amount → net Δ circulating = 0.
    SupplySnapshot: totalMinted += emission, totalBurned += emission, circulatingSupply unchanged.
    """

    def test_burn_equals_emission(self):
        r = calculate(10_000)
        assert r["burn_amount"] == pytest.approx(r["emission_amount"])

    def test_net_circulating_supply_change_is_zero(self):
        r = calculate(10_000)
        net = r["emission_amount"] - r["burn_amount"]
        assert net == pytest.approx(0.0)

    def test_supply_snapshot_invariant(self):
        """SupplySnapshot: totalMinted += emission, totalBurned += emission, circulatingSupply unchanged."""
        prev_minted  = 500_000.0
        prev_burned  = 500_000.0
        prev_supply  = 0.0

        r = calculate(10_000)

        new_minted  = prev_minted + r["emission_amount"]
        new_burned  = prev_burned + r["burn_amount"]
        new_supply  = prev_supply  # unchanged — net zero

        assert new_minted == pytest.approx(510_000.0)
        assert new_burned == pytest.approx(510_000.0)
        assert new_supply == pytest.approx(0.0)

    def test_total_minted_equals_total_burned_across_multiple_txs(self):
        total_minted = 0.0
        total_burned = 0.0
        for amount in [100, 500, 10_000, 0.01, 999_999]:
            r = calculate(amount)
            total_minted += r["emission_amount"]
            total_burned += r["burn_amount"]
        assert total_minted == pytest.approx(total_burned)


# ---------------------------------------------------------------------------
# AFC Reserve price index
# ---------------------------------------------------------------------------

class TestAfcReserveIndex:
    def test_index_starts_at_one_when_reserve_is_zero(self):
        assert reserve_index(0) == pytest.approx(1.0)

    def test_index_formula(self):
        R = 250_000
        expected = 1.0 + math.sqrt(R) / 10_000
        assert reserve_index(R) == pytest.approx(expected)

    def test_index_grows_with_reserve(self):
        assert reserve_index(1_000_000) > reserve_index(1_000)

    def test_index_is_sub_linear(self):
        # 4× reserve → less than 4× excess over 1.0
        excess_r1 = reserve_index(10_000) - 1.0
        excess_r2 = reserve_index(40_000) - 1.0
        assert excess_r2 < 4 * excess_r1

    def test_index_monotonically_increases(self):
        values = [reserve_index(r) for r in [0, 100, 10_000, 1_000_000]]
        assert values == sorted(values)

    def test_afc_accumulation_raises_index(self):
        """Each TX cycle deposits afcShare → reserve grows → index rises."""
        reserve = 0.0
        idx_before = reserve_index(reserve)
        for _ in range(100):
            r = calculate(10_000)
            reserve += r["afc_reserve_share"]
        idx_after = reserve_index(reserve)
        assert idx_after > idx_before
