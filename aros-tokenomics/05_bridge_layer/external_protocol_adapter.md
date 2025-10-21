# External Protocol Adapter

Adapters connect the Bridge Layer to external blockchains and financial networks.

## Capabilities

- **Transaction Translation**: Convert between AST formats and partner protocols.
- **Fee Abstraction**: Manage fee payment in native assets while accounting in ARO.
- **Retry Logic**: Resubmit transactions when external networks experience congestion.

## Security

- Signed configuration manifests per adapter instance.
- Rate limiting and anomaly detection guard against misuse.
- Test suites validate compatibility before deployment.

## Maintenance

Adapters follow versioned release cycles with backward compatibility guarantees. Governance reviews
integration roadmaps to prioritise new networks.
