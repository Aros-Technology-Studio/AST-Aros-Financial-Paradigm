# Bridge Access Control

Access control restricts bridge functionality to authorised entities.

## Roles

- **Operator**: Manages daily operations, limited permissions.
- **Supervisor**: Approves high-risk transactions, monitors compliance.
- **Auditor**: Read-only access to logs and reports.
- **Emergency Authority**: Can pause bridges or initiate failsafes.

## Mechanisms

- Multi-factor authentication with hardware tokens.
- Role-based access control enforced through smart contracts and off-chain IAM.
- Session recording and just-in-time privilege elevation.

## Review Process

Quarterly access reviews ensure privileges remain appropriate. Anomalous access attempts trigger alerts
and may lock accounts pending investigation.
