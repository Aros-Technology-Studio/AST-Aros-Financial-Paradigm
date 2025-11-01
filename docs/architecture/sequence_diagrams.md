# AST Platform: Sequence Diagrams

This document provides visual sequence diagrams for the most critical processes within the AST "Swiss Watch" architecture. These diagrams are generated using Mermaid code and illustrate the flow of logic between different system modules.

---

## 1. Standard Transaction Lifecycle (Module 07)

This diagram shows the complete lifecycle of a standard user transaction, from submission to finalization and audit.

**Source Files:**
* `07_processing_layer/tx_queue_handler.md`
* `07_processing_layer/tx_validation_pipeline.md`
* `12_nodechain_ai_agents/anomaly_detection_engine.md`
* `07_processing_layer/tx_dispatch_engine.md`
* `07_processing_layer/tx_journal_writer.md`
* `02_nodechain_engine/network_consensus_model.md`

```mermaid
sequenceDiagram
    participant User
    participant Node_API as Node API
    participant Mod_07_Queue as TX Queue Handler
    participant Mod_07_Validate as Validation Pipeline
    participant Mod_12_AI as AI Anomaly Engine
    participant Mod_07_Dispatch as Dispatch Engine
    participant Mod_02_Consensus as Nodechain Consensus
    participant Mod_07_Journal as TX Journal Writer

    User->>+Node_API: Submit Transaction(tx)
    Node_API->>+Mod_07_Queue: Enqueue(tx)
    
    Mod_07_Queue->>+Mod_07_Validate: Process(tx)
    Mod_07_Validate->>Mod_07_Validate: 1. Check Schema (Format)
    Mod_07_Validate->>Mod_07_Validate: 2. Check Signature
    Mod_07_Validate->>Mod_07_Validate: 3. Check TTL (Expiration)
    Mod_07_Validate->>Mod_07_Validate: 4. Check Balance (Funds)
    
    alt Transaction is Invalid
        Mod_07_Validate-->>-Mod_07_Queue: REJECT(tx)
        Mod_07_Queue-->>-Node_API: Status: Failed
        Node_API-->>-User: Error: Invalid Transaction
    end

    Mod_07_Validate->>+Mod_12_AI: Request RiskScore(tx)
    Mod_12_AI->>Mod_12_AI: Analyze Patterns
    Mod_12_AI-->>-Mod_07_Validate: Return RiskScore
    
    alt High Risk Score
        Mod_07_Validate-->>-Mod_07_Queue: REJECT(tx, "AI Flag")
        Mod_07_Queue-->>-Node_API: Status: Failed (AI Flag)
        Node_API-->>-User: Error: Transaction Flagged
    end

    Mod_07_Validate-->>-Mod_07_Queue: VALIDATED(tx)
    Mod_07_Queue->>+Mod_07_Dispatch: AddToBatch(tx)
    Mod_07_Dispatch->>Mod_07_Dispatch: Route to Shard (ADR-004)
    Mod_07_Dispatch->>+Mod_02_Consensus: Propose Batch
    
    Mod_02_Consensus->>Mod_02_Consensus: Run Quorum Vote (ADR-001)
    
    alt Consensus Fails
        Mod_02_Consensus-->>-Mod_07_Dispatch: Status: Failed
        Mod_07_Dispatch-->>-Mod_07_Queue: Re-queue(tx)
    end
    
    Mod_02_Consensus-->>-Mod_07_Dispatch: Status: Success (Batch Committed)
    
    Mod_07_Dispatch->>+Mod_07_Journal: WriteToLogs(tx_batch)
    Mod_07_Journal->>Mod_07_Journal: 1. Write to TX Audit Log (ADR-006)
    Mod_07_Journal->>Mod_07_Journal: 2. Write to Token Log (ADR-006)
    Mod_07_Journal-->>-Mod_07_Dispatch: Log OK
    
    Mod_07_Dispatch-->>-Mod_07_Queue: FINALIZED(tx)
    Mod_07_Queue-->>-Node_API: Status: Success
    Node_API-->>-User: Transaction Confirmed
