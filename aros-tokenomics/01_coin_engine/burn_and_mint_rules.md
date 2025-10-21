# Burn and Mint Rules

Minting and burning are tightly governed to guarantee provable monetary discipline. All operations
must pass automated checks and, depending on magnitude, human governance review.

## Minting Rules

1. **Authorised Triggers**: Mint operations originate from the Emission Layer or approved emergency
liquidity programs. Smart contracts outside this perimeter cannot mint ARO.
2. **Proof Requirements**: Each mint transaction references the corresponding emission epoch ID,
cryptographic proofs from the PoT engine, and supervisory signatures where applicable.
3. **Rate Limits**: Policy defines hard caps per epoch, per day, and per emergency event. Attempted
minting beyond these limits reverts automatically.
4. **Distribution Constraints**: Minted ARO must be delivered into pre-defined vaults (validator
rewards, ecosystem, treasury, compliance). Any reallocation requires a governance proposal.

## Burn Rules

1. **Fee Recycling**: A fixed percentage of transaction fees is burned automatically to offset
inflation and align supply with transaction throughput.
2. **Volatility Response**: When volatility thresholds are crossed, the Supervisory Layer can activate
accelerated burn cycles that gradually remove ARO over several epochs to avoid market shocks.
3. **Penalty Enforcement**: Slashed validators, fraudulent bridge operators, and governance
violations trigger instant burns from collateralised positions.
4. **Manual Burns**: Treasury-managed burns require council approval recorded on-chain, with a
mandatory 72-hour review window for transparency.

## Auditability

Every burn and mint event is hashed into the Processing Layer’s audit log, with metadata replicated to
external compliance archives. Quarterly audits reconcile minted and burned amounts against vault
balances to confirm that outstanding supply matches the published emission curve.
