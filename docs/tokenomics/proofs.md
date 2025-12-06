# Cryptographic Proofs & Auditing

## 1. Proof of Claim (PoC)
PoC is a cryptographic proof required for the reverse tokenization (redemption) process, linking the biological burn to the original asset.

$$
PoC = \text{Hash}(TX_{origin} \parallel KYC_{ID} \parallel \text{Timestamp} \parallel \text{ValidationSignatures})
$$

Where:
*   **$TX_{origin}$**: Original transaction ID of valid issuance/deposit.
*   **$KYC_{ID}$**: Identity hash of the claimant.
*   **Timestamp**: Time of the claim.
*   **ValidationSignatures**: Signatures from validators approving the claim.

**Purpose**: Ensures that only legitimate token holders with valid KYC can redeem assets, preventing double claims.

## 2. Deterministic Proof Hash (DPH)
DPH creates an immutable audit trail for the entire system state.

$$
DPH = \text{Hash}(TX_{ID} \parallel V \parallel t \parallel Sig_1 \parallel Sig_2 \parallel \dots)
$$

Where:
*   **$TX_{ID}$**: Transaction ID.
*   **$V$**: Volume/Amount.
*   **$t$**: Timestamp.
*   **$Sig_n$**: Validator signatures.

**Purpose**: Used for regulatory reporting and dispute resolution. It guarantees that the history has not been tampered with.
