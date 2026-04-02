# Production Hardening Checklist

## Security Baseline

- Set `APP_DEBUG=false` in production.
- Set a strong `JWT_SECRET` (>= 32 chars, random).
- Restrict `CORS_ALLOWED_ORIGINS` to known frontend domains.
- Enforce HTTPS at reverse proxy / load balancer.
- Rotate JWT secret using planned key rotation windows.

## Authentication

- Registration policy: min 12-char password with upper/lower/number.
- Auth route rate limiting enabled via `AUTH_RATE_LIMIT_PER_MINUTE`.
- Global rate limiting enabled via `RATE_LIMIT_PER_MINUTE`.

## Database

- Apply migrations before deployment:
  - `database.sql`
  - `migrate_add_report_columns.sql`
- Use least-privilege DB user (not root).
- Enable automated backups and point-in-time recovery.

## App Runtime

- Run behind Nginx/Apache reverse proxy with HTTPS certificates.
- Keep `storage/` writable and monitored for size growth.
- Monitor `storage/logs/app.log` for anomalies.

## Observability

- Centralize logs (ELK/Datadog/CloudWatch).
- Add uptime checks for `/api/health`.
- Add alerting for 5xx spikes and auth brute-force events.

## Data/ML Integrity

- Validate IEEE/Scopus API keys in production env.
- Set and calibrate threshold policy by dataset.
- Periodically benchmark false positives/negatives.

## Remaining Work for Enterprise Grade

- Replace custom JWT with vetted library and key rotation (JWKS).
- Add async queue for long-running source checks.
- Add malware scanning on uploaded files.
- Add full automated test suite + CI pipeline with security scans.
