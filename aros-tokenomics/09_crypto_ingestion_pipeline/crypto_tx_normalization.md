# Crypto Transaction Normalization

Normalization converts external transaction formats into AST standard.

## Steps

- Parse transaction data from source chain.
- Map fields to AST schema with compliance metadata.
- Convert units and handle decimals precisely.
- Validate against travel rule data and AML heuristics.

## Tooling

Normalization pipelines built with deterministic parsers and extensive test fixtures covering chain
forks and edge cases.
