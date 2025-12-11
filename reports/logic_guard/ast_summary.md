# AST Logic Guard Summary

| Rule | Errors | Warnings |
|---|---|---|
| AUD-ROLLBACK | 3 | 0 |
| CRYPTO-LINK | 66 | 0 |
| DOC-STYLE | 20 | 1 |
| KYC-LINK | 58 | 0 |
| NON-SPEC | 1 | 0 |
| POT-LOGIC | 0 | 0 |
| TERM-FORBID | 9 | 0 |
| TIME-SYNC | 6 | 8 |
| XREF | 0 | 0 |

## Critical findings
- TERM-FORBID: Forbidden term "reward" found (tools/spec_rules.json)
- TERM-FORBID: Forbidden term "rewards" found (tools/spec_rules.json)
- TERM-FORBID: Forbidden term "Reward" found (tools/spec_rules.json)
- TERM-FORBID: Forbidden term "woзнагражд" found (tools/spec_rules.json)
- TERM-FORBID: Forbidden term "stake-to-validate" found (tools/spec_rules.json)
- AUD-ROLLBACK: Contradiction: rollback and no rollback present (07_processing_layer/tx_ttl_expiration.md)
- AUD-ROLLBACK: Contradiction: rollback and no rollback present (07_processing_layer/tx_execution_guardrails.md)
- AUD-ROLLBACK: Contradiction: rollback and no rollback present (07_processing_layer/tx_ttl_expiration md  250f1989022c80c0bc35da35a8324342/tx_lifecycle_management.md)
- TERM-FORBID: Forbidden term "reward" found (12_nodechain_ai_agents/agent_roles_matrix.md)
- TERM-FORBID: Forbidden term "Reward" found (12_nodechain_ai_agents/agent_roles_matrix.md)
- TERM-FORBID: Forbidden term "reward" found (12_nodechain_ai_agents/validator_behavior_monitor.md)
- TERM-FORBID: Forbidden term "Reward" found (12_nodechain_ai_agents/validator_behavior_monitor.md)