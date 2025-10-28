# crypto_to_aroscoin_conversion.md

## 1. Purpose

This document defines how AST transforms normalized external crypto transactions (`ARO_TX`) into internal `ArosCoin` balances and ledger entries.
This is the final step in crypto ingestion: turning a verified external crypto event into a usable, fungible token within AST.

---

## 2. Conceptual Model

Once a transaction is normalized into `ARO_TX`, AST must:

1. **Interpret** the value (`amount`, `token_symbol`)
2. **Apply** a conversion multiplier (from `multi_chain_bridge_registry`)
3. **Mint or reassign** internal ArosCoin balances to recipients

This process is fully internal and does not require any token issuance on external chains.

---

## 3. Conversion Formula

```text
ARO_amount = external_amount × conversion_rate

```

Where:

- `external_amount` is taken from `ARO_TX.amount`
- `conversion_rate` is retrieved from the chain’s registry entry
- `ARO_amount` is the resulting value credited in ArosCoin

Example:

- A transaction of `1.5 ETH` on Ethereum Mainnet
- With conversion rate `1 ETH = 1000 ARO`
→ `ARO_amount = 1500 ARO`

---

## 4. Conversion Engine Process

### Step 1: Validation

- Verify that the `ARO_TX` has `proof_hash` and normalized structure
- Check that `token_symbol` is listed in allowed tokens

### Step 2: Rate Resolution

- Load `conversion_rate` from the registry for given `source_chain`
- Use fallback/default if no token-specific override is found

### Step 3: Execution

- Create `mint_instruction` for the computed `ARO_amount`
- Assign resulting balance to the `receiver` in `ARO_TX`
- Emit internal event: `converted_crypto_tx`

---

## 5. ArosCoin Ledger Entry

Each conversion results in a ledger record:

```json
{
  "tx_id": "aro_gen_<hash>",
  "source_tx_id": "ARO_TX.id",
  "source_chain": "eth_mainnet",
  "original_amount": 1.5,
  "token_symbol": "ETH",
  "converted_to": 1500,
  "token": "ARO",
  "receiver": "<internal_user_or_contract_id>",
  "timestamp": "<now>"
}

```

---

## 6. Notes on Non-1:1 Conversion

- AST supports **floating conversion rates**
- Rates can be:
    - **Fixed per token**
    - **Adjusted periodically via governance**
    - **Derived from internal price feeds** (optional future integration)

---

## 7. Audit & Traceability

- All conversions are:
    - Hash-linked to original `ARO_TX`
    - Logged immutably inside `NodeChain`
    - Cross-referenceable by `source_tx_id`

---

## 8. Summary

This mechanism finalizes the ingestion of external crypto into AST.

It guarantees that every accepted crypto transaction becomes an actionable, validated, and traceable `ArosCoin` balance — the only internal unit of account within the AST system.
