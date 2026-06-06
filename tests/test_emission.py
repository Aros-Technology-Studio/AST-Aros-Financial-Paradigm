"""
Canonical 1:1 Emission Model — unit tests.

Mirrors the logic in src/token/emission.service.ts so we can
verify the formulas independently without a running NestJS server.

Canonical rules (as of current implementation):
  emission       = tx_amount                          (1:1)
  commission     = tx_amount * rate                   (default 0.5%)
  node_share     = commission * 0.75                  (75%)
  afc_share      = commission * 0.25                  (25%)
  burn_amount    = emission - commission              (recipient burns the residual)
  net_supply_Δ   = +commission per TX cycle          (commission stays in node pool / AFC)
  reserve_index  = 1.0 + sqrt(total_afc_reserve) / 10_000
"""

import math
import pytest


# ---------------------------------------------------------------------------
# Pure-Python mirror of EmissionService.calculate()
# ---------------------------------------------------------------------------

DEFAULT_COMMISSION_RATE = 0.005  # 0.5%
NODE_SHARE_RATIO        = 0.75
AFC_RESERVE_RATIO       = 0.25


def calculate(tx_amount: float, rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    if tx_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    if not (0 < rate < 1):
        raise ValueError("Commission rate must be between 0 and 1 exclusive")

    emission    = tx_amount
    commission  = tx_amount * rate
    node_share  = commission * NODE_SHARE_RATIO
    afc_share   = commission * AFC_RESERVE_RATIO
    # Recipient holds emission, pays commission in two fee steps, then burns the rest.
    # Burning the full emission amount would create a ledger deficit equal to commission.
    burn_amount = emission - commission

    return {
        "transaction_amount": tx_amount,
        "emission_amount":    emission,
        "commission":         commission,
        "node_share":         node_share,
        "afc_reserve_share":  afc_share,
        "burn_amount":        burn_amount,
        "commission_rate":    rate,
    }


def reserve_index(total_afc_reserve: float) -> float:
    return 1.0 + math.sqrt(total_afc_reserve) / 10_000


# ---------------------------------------------------------------------------
# Tests
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

    def test_burn_amount_equals_emission_minus_commission(self):
        r = calculate(10_000)
        assert r["burn_amount"] == pytest.approx(r["emission_amount"] - r["commission"])
        assert r["burn_amount"] == pytest.approx(9_950.0)

    def test_custom_commission_rate(self):
        r = calculate(10_000, rate=0.01)
        assert r["commission"]   == pytest.approx(100.0), "1% of 10_000 = 100"
        assert r["node_share"]   == pytest.approx(75.0)
        assert r["afc_reserve_share"] == pytest.approx(25.0)
        assert r["burn_amount"]  == pytest.approx(9_900.0)

    def test_small_transaction(self):
        r = calculate(1.0)
        assert r["emission_amount"] == pytest.approx(1.0)
        assert r["commission"]      == pytest.approx(0.005)
        assert r["node_share"]      == pytest.approx(0.00375)
        assert r["afc_reserve_share"] == pytest.approx(0.00125)
        assert r["burn_amount"]     == pytest.approx(0.995)

    def test_fractional_amount(self):
        r = calculate(0.00000001)  # 1 satoshi equivalent
        assert r["emission_amount"] == pytest.approx(0.00000001)

    def test_zero_amount_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate(0)

    def test_negative_amount_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate(-100)

    def test_rate_zero_raises(self):
        with pytest.raises(ValueError):
            calculate(100, rate=0.0)

    def test_rate_one_raises(self):
        with pytest.raises(ValueError):
            calculate(100, rate=1.0)

    def test_rate_above_one_raises(self):
        with pytest.raises(ValueError):
            calculate(100, rate=1.5)


class TestNetSupply:
    """
    Net circulating supply change per TX cycle = commission.
    Commission stays in NODE_POOL and AFC_RESERVE; recipient's residual is burned.
    """

    def test_burn_is_less_than_emission_by_commission(self):
        r = calculate(10_000)
        assert r["emission_amount"] - r["burn_amount"] == pytest.approx(r["commission"])

    def test_net_supply_delta_equals_commission(self):
        r = calculate(10_000)
        minted = r["emission_amount"]   # 10,000 minted
        burned = r["burn_amount"]       # 9,950 burned
        net    = minted - burned        # +50 stays in node pool / AFC reserve
        assert net == pytest.approx(r["commission"])

    def test_supply_snapshot_invariant(self):
        """SupplySnapshot: totalMinted += emission, totalBurned += burnAmount, circulatingSupply += commission."""
        prev_minted  = 500_000.0
        prev_burned  = 499_750.0  # matches prior 50-ARO-per-TX net
        prev_supply  = 250.0      # 5 prior TXs × 50 ARO

        r = calculate(10_000)

        new_minted  = prev_minted + r["emission_amount"]
        new_burned  = prev_burned + r["burn_amount"]
        new_supply  = prev_supply + r["commission"]

        assert new_minted  == pytest.approx(510_000.0)
        assert new_burned  == pytest.approx(509_700.0)
        assert new_supply  == pytest.approx(300.0)


class TestAfcReserveIndex:
    def test_index_starts_at_one_when_reserve_is_zero(self):
        assert reserve_index(0) == pytest.approx(1.0)

    def test_index_grows_with_reserve(self):
        idx_low  = reserve_index(10_000)
        idx_high = reserve_index(100_000)
        assert idx_high > idx_low, "Reserve index must grow with reserve"

    def test_known_value_10k(self):
        # sqrt(10_000) / 10_000 = 100 / 10_000 = 0.01
        assert reserve_index(10_000) == pytest.approx(1.01)

    def test_known_value_1m(self):
        # sqrt(1_000_000) / 10_000 = 1_000 / 10_000 = 0.1
        assert reserve_index(1_000_000) == pytest.approx(1.1)

    def test_known_value_100m(self):
        # sqrt(100_000_000) / 10_000 = 10_000 / 10_000 = 1.0 → index = 2.0
        assert reserve_index(100_000_000) == pytest.approx(2.0)

    def test_index_is_monotonically_nondecreasing(self):
        reserves = [0, 1, 100, 1_000, 10_000, 100_000, 1_000_000]
        indices  = [reserve_index(r) for r in reserves]
        for i in range(1, len(indices)):
            assert indices[i] >= indices[i - 1], "Reserve index must not decrease"

    def test_sublinear_growth(self):
        """sqrt gives exactly 10x index delta for 100x reserve increase."""
        delta_low  = reserve_index(1_000_000)   - reserve_index(0)
        delta_high = reserve_index(100_000_000) - reserve_index(0)
        assert delta_high / delta_low == pytest.approx(10.0)

    def test_afc_accumulation_after_multiple_transactions(self):
        """Simulate 100 canonical $10,000 transactions and verify index growth."""
        total_afc = 0.0
        for _ in range(100):
            r = calculate(10_000)
            total_afc += r["afc_reserve_share"]

        expected_total = 12.5 * 100  # 12.50 per TX × 100
        assert total_afc == pytest.approx(expected_total)

        idx = reserve_index(total_afc)
        assert idx > 1.0, "Index must be above 1 after accumulation"
        assert idx == pytest.approx(1.0 + math.sqrt(1_250) / 10_000)


class TestCanonicalExample:
    """Verifies the exact $10,000 example from coin_emission_model.md."""

    def test_full_10k_example(self):
        r = calculate(10_000)

        assert r["transaction_amount"]  == 10_000
        assert r["emission_amount"]     == pytest.approx(10_000.0)   # 1:1 mint
        assert r["commission"]          == pytest.approx(50.0)       # 0.5%
        assert r["node_share"]          == pytest.approx(37.5)       # 75%
        assert r["afc_reserve_share"]   == pytest.approx(12.5)       # 25%
        assert r["burn_amount"]         == pytest.approx(9_950.0)    # emission − commission
        assert r["commission_rate"]     == DEFAULT_COMMISSION_RATE

    def test_full_10k_net_supply(self):
        r = calculate(10_000)
        net = r["emission_amount"] - r["burn_amount"]
        assert net == pytest.approx(50.0), "Net circulating supply Δ = commission = 50 ARO"

    def test_full_10k_reserve_index_after_first_tx(self):
        r = calculate(10_000)
        idx = reserve_index(r["afc_reserve_share"])
        assert idx == pytest.approx(1.0 + math.sqrt(12.5) / 10_000)
        assert idx > 1.0, "Emission price rises after first TX"
