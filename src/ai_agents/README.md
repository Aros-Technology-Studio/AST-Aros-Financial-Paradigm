# AI Agents Module (Module 12)

This module implements the **Active Supervision** layer of the AST platform.

## Components

### Validator Behavior Monitor
- **Service**: `src/ai_agents/validator-behavior.service.ts`
- **Documentation**: `docs/ai_agents/validator_behavior_monitor.md`
- **Responsibility**: Tracks validator performance (uptime, missed blocks) and assigns trust scores.

## Usage
The `ValidatorBehaviorService` is injected into the NodeChain block processing pipeline to assess validators at the end of every epoch.
