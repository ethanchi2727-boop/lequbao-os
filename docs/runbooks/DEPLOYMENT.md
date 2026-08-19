# Production candidate deployment

The repository builds three non-root container targets from `deploy/Dockerfile`: `api`, `worker` and `web`. Both API and Worker use portable production-only pnpm deploy output. The Web target serves immutable build output through the repository-owned production server with CSP, anti-framing, no-sniff, referrer and HSTS headers.

## Build

```sh
docker build -f deploy/Dockerfile --target api -t lequ-api:${RELEASE_COMMIT} .
docker build -f deploy/Dockerfile --target worker -t lequ-worker:${RELEASE_COMMIT} .
docker build -f deploy/Dockerfile --target web -t lequ-web:${RELEASE_COMMIT} .
```

Use an immutable registry digest in deployment manifests. Do not deploy `latest`. Scan all three images before promotion and retain image digests, SBOM linkage and scan results with the release evidence.

## Runtime boundary

- API always requires `DATABASE_URL`, `AUTH_JWT_SECRET`, `OBJECT_STORE_GATEWAY_URL` and `OBJECT_STORE_SIGNING_SECRET`. With `NODE_ENV=production`, it additionally requires every launch-flow identity, encryption, payment/refund, customer-service, GEO/plugin, mini-program, Enterprise-WeCom and internal-Worker variable listed in `.env.example`; a missing variable refuses startup instead of publishing a misleading readiness signal. In non-production environments, configuring only part of any provider group also refuses startup. Liveness is `/health`; database readiness is `/ready`.
- `WECOM_CONFIG_GATEWAY_URL` is a multi-tenant HTTPS trust boundary. It resolves each callback CorpID to secret-manager-backed token/AES settings, then resolves the decrypted member to a current tenant/user/store identity and intake session. The API rejects a cross-Corp response and no longer supports environment-bound single-merchant callback identities.
- Web listens on port 8080 and exposes `/health`. Terminate TLS at the controlled ingress and keep `/api` same-origin where possible.
- Worker is a one-shot tenant-scoped job. The scheduler supplies one active `WORKER_TENANT_ID`, database credentials, `OUTBOX_EVENT_GATEWAY_URL` and `OUTBOX_EVENT_GATEWAY_TOKEN`. Production additionally requires the complete internal API, privacy deletion and privacy export gateway groups. Run jobs with overlap forbidden per tenant. Missing event-gateway configuration fails before any Outbox claim. Crashed claims become reclaimable after five minutes.
- Inject secrets from the environment's secret manager. Never bake `.env`, callbacks, provider keys, database URLs or customer evidence into an image.

## Promotion and rollback

1. Apply `database/schema.sql` or the reviewed incremental migrations before routing candidate traffic; migrations remain expand-only inside the rollback window.
2. Start API, require `/ready` success, then start Web. Run one synthetic tenant Worker invocation and prove no row remains `PROCESSING` under its worker ID.
3. Run the controlled suites and bind artifacts to the candidate commit and immutable image digests.
4. Promote by digest through internal, pilot, canary and full waves. Stop on a P0 condition or unexplained reconciliation difference.
5. Before the first production write, a greenfield rollback may remove the candidate. After the first V6 write, use only a proven compatible application rollback, forward fix or verified V6 restore; never overwrite V6 facts with V5 data.
