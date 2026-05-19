"""
Canonical 1:1 emission model — pure-math unit tests (no framework dependency).
These mirror the TypeScript EmissionService.calculate() invariants.
"""
import sys


def calculate(transaction_amount: float, commission_rate: float = 0.005):
    """Python reference implementation of EmissionService.calculate()."""
    if transaction_amount <= 0:
        raise ValueError("Transaction amount must be positive")
    emission = transaction_amount
    commission = transaction_amount * commission_rate
    node_share = commission * 0.75
    afc_share = commission * 0.25
    return {
        "transactionAmount": transaction_amount,
        "emissionAmount": emission,
        "commission": commission,
        "nodeShare": node_share,
        "afcReserveShare": afc_share,
        "commissionRate": commission_rate,
    }


def reserve_index(total_reserve: float) -> float:
    import math
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_1_1_emission():
    r = calculate(10_000)
    assert r["emissionAmount"] == 10_000, "Emission must equal transaction amount (1:1)"


def test_default_commission_rate():
    r = calculate(10_000)
    assert abs(r["commissionRate"] - 0.005) < 1e-9
    assert abs(r["commission"] - 50.0) < 1e-9


def test_fee_split_75_25():
    r = calculate(10_000)
    assert abs(r["nodeShare"] - 37.5) < 1e-9
    assert abs(r["afcReserveShare"] - 12.5) < 1e-9


def test_node_plus_afc_equals_commission():
    r = calculate(10_000)
    assert abs(r["nodeShare"] + r["afcReserveShare"] - r["commission"]) < 1e-9


def test_custom_commission_rate():
    r = calculate(1_000, 0.01)
    assert abs(r["commission"] - 10.0) < 1e-9
    assert abs(r["nodeShare"] - 7.5) < 1e-9
    assert abs(r["afcReserveShare"] - 2.5) < 1e-9


def test_invalid_amount_raises():
    try:
        calculate(0)
        assert False, "Should have raised"
    except ValueError:
        pass

    try:
        calculate(-100)
        assert False, "Should have raised"
    except ValueError:
        pass


def test_reserve_index_starts_at_one():
    assert reserve_index(0) == 1.0


def test_reserve_index_rises_with_accumulation():
    idx1 = reserve_index(12.5)
    idx2 = reserve_index(25.0)
    assert idx2 > idx1 > 1.0


def test_reserve_index_formula():
    import math
    total = 12.5
    expected = 1.0 + math.sqrt(total) / 10_000
    assert abs(reserve_index(total) - expected) < 1e-12


def test_example_10k_transaction():
    """Canonical example from spec: $10,000 TX."""
    r = calculate(10_000)
    assert r["emissionAmount"] == 10_000   # 1:1 mint
    assert abs(r["commission"] - 50) < 1e-9
    assert abs(r["nodeShare"] - 37.5) < 1e-9
    assert abs(r["afcReserveShare"] - 12.5) < 1e-9
    # net circulating supply change = 0  (emissionAmount burned after TX)


if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_")]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(failed)
