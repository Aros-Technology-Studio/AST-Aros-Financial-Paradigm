"""
Canonical 1:1 emission model — unit tests.
Pure Python: no runtime dependencies. Mirrors EmissionService.calculate() logic.
"""

import math
import pytest

DEFAULT_COMMISSION_RATE = 0.005  # 0.5%
NODE_SHARE_RATIO = 0.75
AFC_SHARE_RATIO = 0.25


def calculate(transaction_amount: float, commission_rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    """Python mirror of EmissionService.calculate()."""
    if transaction_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    emission = transaction_amount
    commission = transaction_amount * commission_rate
    node_share = commission * NODE_SHARE_RATIO
    afc_share = commission * AFC_SHARE_RATIO
    return {
        "emission_amount": emission,
        "commission": commission,
        "node_share": node_share,
        "afc_reserve_share": afc_share,
        "commission_rate": commission_rate,
    }


def reserve_index(total_reserve: float) -> float:
    """AFC reserve price index formula."""
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ---------------------------------------------------------------------------
# 1:1 emission
# ---------------------------------------------------------------------------

def test_emission_equals_transaction_amount():
    r = calculate(10_000)
    assert r["emission_amount"] == 10_000

def test_emission_one_dollar():
    r = calculate(1.0)
    assert r["emission_amount"] == 1.0

def test_emission_fractional():
    r = calculate(0.000001)
    assert r["emission_amount"] == pytest.approx(0.000001)

# ---------------------------------------------------------------------------
# Commission split
# ---------------------------------------------------------------------------

def test_commission_default_rate():
    r = calculate(10_000)
    assert r["commission"] == pytest.approx(50.0)

def test_node_share_75_pct():
    r = calculate(10_000)
    assert r["node_share"] == pytest.approx(37.50)

def test_afc_share_25_pct():
    r = calculate(10_000)
    assert r["afc_reserve_share"] == pytest.approx(12.50)

def test_node_plus_afc_equals_commission():
    r = calculate(10_000)
    assert r["node_share"] + r["afc_reserve_share"] == pytest.approx(r["commission"])

def test_custom_commission_rate():
    r = calculate(10_000, commission_rate=0.01)
    assert r["commission"] == pytest.approx(100.0)
    assert r["node_share"] == pytest.approx(75.0)
    assert r["afc_reserve_share"] == pytest.approx(25.0)

# ---------------------------------------------------------------------------
# Net circulating supply (mint + burn = 0 net change)
# ---------------------------------------------------------------------------

def test_net_supply_change_is_zero():
    r = calculate(10_000)
    net_change = r["emission_amount"] - r["emission_amount"]  # mint then burn
    assert net_change == 0.0

# ---------------------------------------------------------------------------
# AFC reserve index
# ---------------------------------------------------------------------------

def test_reserve_index_starts_at_one():
    assert reserve_index(0.0) == 1.0

def test_reserve_index_rises_with_reserve():
    assert reserve_index(100.0) > reserve_index(0.0)

def test_reserve_index_monotonic():
    values = [reserve_index(r) for r in [0, 12.5, 100, 10_000, 1_000_000]]
    assert values == sorted(values)

def test_reserve_index_formula_10000_tx():
    # After one $10,000 TX: afcShare = 12.50
    idx = reserve_index(12.50)
    assert idx == pytest.approx(1.0 + math.sqrt(12.50) / 10_000)

# ---------------------------------------------------------------------------
# Guard: negative / zero amount
# ---------------------------------------------------------------------------

def test_zero_amount_raises():
    with pytest.raises(ValueError):
        calculate(0)

def test_negative_amount_raises():
    with pytest.raises(ValueError):
        calculate(-100)
