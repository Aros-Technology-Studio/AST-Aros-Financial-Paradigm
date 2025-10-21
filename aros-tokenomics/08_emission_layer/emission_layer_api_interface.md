# Emission Layer API Interface

APIs expose emission data and controls to authorised systems.

## Endpoints

- `GET /emission/epoch/:id` – Retrieve detailed emission data for an epoch.
- `POST /emission/override` – Submit authorised override requests with digital signatures.
- `GET /emission/policy` – Fetch current policy parameters.
- `GET /emission/reports` – Download aggregated reporting datasets.

## Security

- OAuth2 with hardware-backed client credentials.
- Request signing and replay protection.
- Rate limits and audit logging for each call.
