# Transaction Queue Handler

The queue handler ingests transactions, prioritises them, and prepares them for validation.

## Features

- **Priority Levels**: Differentiates urgent compliance actions, standard transactions, and background
operations.
- **Rate Limiting**: Prevents abuse by limiting transactions per identity or IP.
- **Deduplication**: Detects and removes duplicate submissions before processing.

## Workflow

1. Accept transaction from ingress gateways.
2. Validate schema and attach metadata.
3. Place in appropriate queue based on priority and jurisdiction.
4. Emit events to validation engine for further checks.

## Monitoring

Metrics include queue length, wait time, and drop rate. Alerts trigger when thresholds exceeded.
