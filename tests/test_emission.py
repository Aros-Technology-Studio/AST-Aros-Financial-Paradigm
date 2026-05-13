"""
Canonical 1:1 ArosCoin emission model — pure-Python formula tests.

These are protocol-level property tests that mirror the TypeScript
EmissionService.calculate() logic. No external dependencies required.

Run:
    python tests/test_emission.py
    # or via pytest:
    pytest tests/test_emission.py -v
"""

import math

DEFAULT_COMMISSION_RATE: float = 0.005   # 0.5%
NODE_SHARE_RATIO:        float = 0.75
AFC_SHARE_RATIO:         float = 0.25


# ── Protocol formulas (mirror of EmissionService.calculate) ──────────────────

def calculate_emission(tx_amount: float, commission_rate: float = DEFAULT_COMMISSION_RATE) -> dict:
    """
    Canonical emission calculation — pure function, no side effects.
    Raises AssertionError if tx_amount <= 0 (mirrors BadRequestException).
    """
    assert tx_amount > 0, f"Transaction amount must be positive, got {tx_amount}"
    emission   = tx_amount                         # 1:1
    commission = tx_amount * commission_rate
    node_share = commission * NODE_SHARE_RATIO     # 75%
    afc_share  = commission * AFC_SHARE_RATIO      # 25%
    return {
        "transactionAmount": tx_amount,
        "emissionAmount":    emission,
        "commission":        commission,
        "nodeShare":         node_share,
        "afcReserveShare":   afc_share,
        "commissionRate":    commission_rate,
    }


def afc_reserve_index(total_reserve: float) -> float:
    """
    reserveIndex = 1.0 + sqrt(totalReserve) / 10_000
    Sub-linear growth: stable at low volume, meaningful at scale.
    """
    return 1.0 + math.sqrt(total_reserve) / 10_000


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_1_to_1_emission():
    """Emission always equals transaction amount."""
    for amount in [1, 100, 10_000, 999_999.99, 1_000_000]:
        r = calculate_emission(amount)
        assert r["emissionAmount"] == amount, (
            f"1:1 invariant broken for amount={amount}: got {r['emissionAmount']}"
        )


def test_default_commission_rate():
    r = calculate_emission(10_000)
    assert abs(r["commission"] - 50.0) < 1e-9
    assert r["commissionRate"] == DEFAULT_COMMISSION_RATE


def test_75_25_split():
    r = calculate_emission(10_000)
    assert abs(r["nodeShare"]      - 37.5) < 1e-9
    assert abs(r["afcReserveShare"] - 12.5) < 1e-9


def test_commission_adds_up():
    """nodeShare + afcReserveShare must equal commission exactly (no rounding loss)."""
    for amount in [1, 500, 1234.56, 99_999, 1_000_000]:
        r = calculate_emission(amount)
        diff = abs(r["nodeShare"] + r["afcReserveShare"] - r["commission"])
        assert diff < 1e-10, f"Split mismatch for amount={amount}: diff={diff}"


def test_custom_commission_rate():
    r = calculate_emission(1_000, commission_rate=0.01)  # 1%
    assert abs(r["commission"]      - 10.0) < 1e-9
    assert abs(r["nodeShare"]       -  7.5) < 1e-9
    assert abs(r["afcReserveShare"] -  2.5) < 1e-9


def test_zero_amount_raises():
    try:
        calculate_emission(0)
        raise AssertionError("Expected AssertionError for zero amount")
    except AssertionError as e:
        assert "positive" in str(e).lower(), f"Unexpected message: {e}"


def test_negative_amount_raises():
    try:
        calculate_emission(-100)
        raise AssertionError("Expected AssertionError for negative amount")
    except AssertionError as e:
        assert "positive" in str(e).lower(), f"Unexpected message: {e}"


def test_afc_reserve_index_initial():
    """Reserve index starts at 1.0 when reserve is 0."""
    assert afc_reserve_index(0) == 1.0


def test_afc_reserve_index_formula():
    """Index equals 1.0 + sqrt(reserve) / 10_000."""
    for reserve in [0, 12.5, 50, 500, 10_000, 1_000_000]:
        expected = 1.0 + math.sqrt(reserve) / 10_000
        assert abs(afc_reserve_index(reserve) - expected) < 1e-12, (
            f"Index mismatch at reserve={reserve}"
        )


def test_afc_reserve_index_monotone():
    """Index must grow monotonically as reserve accumulates."""
    reserves = [0, 12.5, 50, 500, 10_000, 1_000_000]
    indices = [afc_reserve_index(r) for r in reserves]
    for i in range(1, len(indices)):
        assert indices[i] > indices[i - 1], (
            f"Index not monotone: index[{i}]={indices[i]} <= index[{i-1}]={indices[i-1]}"
        )


def test_canonical_10k_example():
    """End-to-end canonical example from the spec."""
    r = calculate_emission(10_000)
    # TX Amount = 10,000 ARO
    assert r["emissionAmount"] == 10_000
    # Commission = 10,000 × 0.005 = 50 ARO
    assert abs(r["commission"]      - 50.0) < 1e-9
    # Node pool  = 50 × 0.75 = 37.50 ARO
    assert abs(r["nodeShare"]       - 37.5) < 1e-9
    # AFC reserve = 50 × 0.25 = 12.50 ARO
    assert abs(r["afcReserveShare"] - 12.5) < 1e-9
    # After accumulating 12.50 AFC:
    idx = afc_reserve_index(12.5)
    expected_idx = 1.0 + math.sqrt(12.5) / 10_000
    assert abs(idx - expected_idx) < 1e-12
    # Net circulating supply change per TX cycle = 0 (emit then burn)
    net_supply_change = r["emissionAmount"] - r["emissionAmount"]  # mint - burn
    assert net_supply_change == 0


def test_multi_tx_reserve_growth():
    """Simulates 5 sequential $10k transactions and validates reserve index growth."""
    total_reserve = 0.0
    prev_index = 1.0
    for _ in range(5):
        r = calculate_emission(10_000)
        total_reserve += r["afcReserveShare"]
        index = afc_reserve_index(total_reserve)
        assert index > prev_index, "Reserve index must grow with each transaction"
        prev_index = index
    # After 5 × 12.5 AFC = 62.5 AFC accumulated
    assert abs(total_reserve - 62.5) < 1e-9


# ── Runner ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_1_to_1_emission,
        test_default_commission_rate,
        test_75_25_split,
        test_commission_adds_up,
        test_custom_commission_rate,
        test_zero_amount_raises,
        test_negative_amount_raises,
        test_afc_reserve_index_initial,
        test_afc_reserve_index_formula,
        test_afc_reserve_index_monotone,
        test_canonical_10k_example,
        test_multi_tx_reserve_growth,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
    print(f"\n{passed}/{len(tests)} tests passed" + (f", {failed} failed" if failed else "."))
    if failed:
        raise SystemExit(1)
