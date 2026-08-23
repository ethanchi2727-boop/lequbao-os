# Production candidate deployment

## Temporary public preview at bao.lequ.com

The root `compose.yaml` is a deliberately non-production deployment entrypoint for the temporary
`bao.lequ.com` development preview. A repository-pull platform such as Helms can run:

```sh
docker compose up -d --build
```

Route `https://bao.lequ.com` to host port `8080`, preserve the original `Host`, redirect HTTP to
HTTPS and do not publish the PostgreSQL service. Set `LEQU_PREVIEW_PORT` only when Helms needs a
different host port. The default root route enters the explicit development-mock identity flow;
the browser, API and callbacks remain same-origin through the repository Web proxy.

The preview image runs the Mock gateway, API, one-shot Worker loop and Web in one non-root container
so every development-only provider URL remains loopback-only. PostgreSQL is a separate persistent
container and initializes the real 164-table schema plus the idempotent, non-financial development
seed. Hostname acknowledgement, mock mode and database readiness all fail closed. The Web proxy
strips client-supplied forwarding headers, binds non-health traffic to `bao.lequ.com`, marks every
response as a development-mock preview and asks crawlers not to index it.
The application container is healthy only after the Worker has completed successfully and refreshed
its readiness marker within 30 seconds; repeated background-job failures therefore fail deployment
health instead of being hidden by the retry loop.

This Compose file is not a production promotion path. Never put real customer, merchant, payment or
provider data into its volume, and never treat Mock output as controlled acceptance evidence. Do not
delete `postgres-data` during routine redeploys; resetting that volume is an explicit destructive
operation. Production continues to use the three digest-bound targets and the controlled workflow
below.

The repository builds three non-root container targets from `deploy/Dockerfile`: `api`, `worker` and `web`. Both API and Worker use portable production-only pnpm deploy output. The Web target serves immutable build output through the repository-owned production server with CSP, anti-framing, no-sniff, referrer and HSTS headers.

## Build

```sh
docker build -f deploy/Dockerfile --target api -t lequ-api:${RELEASE_COMMIT} .
docker build -f deploy/Dockerfile --target worker -t lequ-worker:${RELEASE_COMMIT} .
docker build -f deploy/Dockerfile --target web -t lequ-web:${RELEASE_COMMIT} .
```

Use an immutable registry digest in deployment manifests. Do not deploy `latest`. Scan all three images before promotion and retain image digests, SBOM linkage and scan results with the release evidence.

The trusted `.github/workflows/publish-candidate-images.yml` workflow publishes the exact checked candidate only from the protected `main` workflow ref and `controlled-preproduction` environment. Before receiving package write permission, it requires successful `code-quality`, `postgres-contract` and `container-build` results whose CI file is byte-identical to trusted policy and whose GitHub Actions run is bound to the exact SHA, same repository, trusted workflow path and push/PR event; a same-name check is insufficient. Check-run API responses must also be structurally complete, so a truncated first page cannot silently become release provenance. The deployment gate dynamically scans every YAML file under `.github/workflows`, so a newly added workflow cannot bypass the approved full-commit Action allowlist or immutable container-image policy. External Actions require approved full commits, while local Action paths must remain normalized repository-relative paths without empty or parent segments. YAML is parsed structurally, including both `image:` mappings and scalar `container:` job shorthand, and malformed workflow YAML fails closed. API, Worker and Web are published to GHCR with a unique candidate/run tag, BuildKit provenance and SBOM attestations; `candidate-image-digests.json` records the three immutable digest references. Deploy only those digest references, never the convenience tag. A new run creates a new tag and manifest rather than overwriting prior release evidence.

All external workflow Actions are pinned to the reviewed full commits in `tooling/github-actions-policy.mjs`; the adjacent major-version comments are informational only. An Action upgrade requires reviewing the upstream release and resolved commit, updating both the workflow reference and central allowlist, then running the complete repository gate. Never replace a pin with `@main`, a branch or a movable version tag.

The external Dockerfile syntax frontend and all images in production Dockerfiles, CI services and the Dev Container use a readable version tag plus an immutable multi-architecture manifest digest recorded in `tooling/container-image-policy.mjs`. Resolve an upgrade against the official registry, review the new frontend/base, update both the reference and allowlist, then rebuild every target and development stack. A movable syntax frontend, bare tag, unknown base or changed digest fails the deployment gate.

All dependency installs in CI, containers and cloud development use `pnpm install --frozen-lockfile`. `pnpm-workspace.yaml` fails installation for unreviewed lifecycle scripts, explicitly denies blanket build approval and exotic transitive sources, and permits only the reviewed `esbuild` build. `tooling/dependency-install-policy.mjs` also requires exact direct versions, SHA-512 lockfile integrity and the pinned pnpm/Node toolchain. The security gate discovers every root, `apps/*` and `packages/*` manifest plus every workflow YAML install entry, so a new workspace package or CI workflow cannot fall outside this policy. It also reconstructs the complete deterministic CycloneDX document from the lockfile and requires exact SBOM equality; retaining only the lock hash while deleting or changing components is rejected. A dependency update must review any new lifecycle script before adding an exact matcher to `allowBuilds`; never weaken the policy to make an install pass.

API and Worker production builds deliberately disable JavaScript source maps, declaration files and declaration maps. Their package manifests publish only `dist`, so `pnpm deploy --prod` cannot copy `src`, tests or TypeScript configuration into the runtime image. After all six builds, `pnpm artifacts:check` recursively verifies regular files, exact entrypoints, extension/file-count/byte ceilings, absence of tests, hidden files, source-map references and secret-shaped values, plus the package boundary. The current dry-run package inventories contain only 65 API JavaScript files plus `package.json` and 12 Worker JavaScript files plus `package.json`; no map, declaration, source or test file is eligible for deployment.

## Runtime boundary

- API always requires `DATABASE_URL`, `AUTH_JWT_SECRET`, `OBJECT_STORE_GATEWAY_URL` and `OBJECT_STORE_SIGNING_SECRET`. With `NODE_ENV=production`, it additionally requires every launch-flow identity, encryption, payment/refund, customer-service, GEO/plugin, mini-program, Enterprise-WeCom and internal-Worker variable listed in `.env.example`; a missing variable refuses startup instead of publishing a misleading readiness signal. Production also rejects placeholder/short secrets, HTTP or loopback gateways, an invalid address-encryption key, invalid `TRUSTED_PROXY_CIDRS` and PostgreSQL without `sslmode=require` or `sslmode=verify-full`. Configure only the exact ingress addresses or CIDRs: a blanket trusted proxy would let clients spoof login risk IPs. In non-production environments, configuring only part of any provider group also refuses startup. Liveness is `/health`; database readiness is `/ready`.
- The employee identity gateway must enforce device, account, source-IP and tenant rate limits and return an explicit allow decision plus policy version. The API sends only server-derived IP/user-agent context, returns a non-enumerating assertion error, maps provider throttling to HTTP 429, and transactionally records successful login and tenant-switch audits with keyed hashes rather than raw assertions, IPs or user agents.
- `WECOM_CONFIG_GATEWAY_URL` is a multi-tenant HTTPS trust boundary. It resolves each callback CorpID to secret-manager-backed token/AES settings, then resolves the decrypted member to a current tenant/user/store identity and intake session. The API rejects a cross-Corp response and no longer supports environment-bound single-merchant callback identities.
- Web listens on port 8080 and exposes `/health`. Terminate TLS at the controlled ingress and keep every employee Bearer API request strictly same-origin. Production Web ignores any `apiBase` query override; external object storage is reached only through a server-issued signed upload ticket.
- Web health proves the configured static root and immutable `index.html` are readable. Static paths are canonicalized with `realpath`, so symlink or junction escapes are rejected before content is served.
- Worker is a one-shot tenant-scoped job. The scheduler supplies one active `WORKER_TENANT_ID`, database credentials, `OUTBOX_EVENT_GATEWAY_URL` and `OUTBOX_EVENT_GATEWAY_TOKEN`. Production additionally requires the complete internal API, privacy deletion and privacy export gateway groups. Run jobs with overlap forbidden per tenant. Missing event-gateway configuration fails before any Outbox claim. Crashed claims become reclaimable after five minutes.
- Inject secrets from the environment's secret manager. Never bake `.env`, callbacks, provider keys, database URLs or customer evidence into an image.
- Before controlled execution, configure a protected GitHub `controlled-preproduction` environment with accountable reviewers and run `.github/workflows/controlled-preflight.yml` against an immutable candidate SHA. The workflow executes only the preflight code checked out from `main`; it resolves but does not execute candidate code while inspecting environment configuration. Every API/Worker production-required setting must be mapped, `RELEASE_COMMIT` must equal the requested candidate, PostgreSQL URLs require `sslmode=require` or `verify-full`, and the Worker tenant must be a concrete UUID. A structurally green preflight is still not suite evidence.
- Stage 49 preflight also requires the successful candidate-image publisher run ID. It binds the run to the current trusted `main` policy SHA, requires one unexpired candidate/run-named Artifact, downloads by immutable Artifact ID, verifies GitHub's Artifact SHA-256 and safely extracts the single manifest before comparison with configured performance topology. Do not transcribe or recreate digest JSON manually; republish after trusted policy changes.
- After all eleven controlled suites are independently reviewed and the local launch precheck passes, use `pnpm controlled:stage-release` to create an exact upload-only bundle, attach it as the sole asset of a candidate-bound draft GitHub Release and dispatch `.github/workflows/verify-controlled-release.yml` from trusted `main`. The protected job locks the immutable Release/Asset IDs, downloads only that Asset ID, rejects unsafe, missing or undeclared package entries, executes only trusted verifier code, and records the archive/results/plan hashes in an OIDC-backed attestation. A self-reported reviewer field or a local green command is not a production approval.

## Promotion and rollback

1. Apply `database/schema.sql` or the reviewed incremental migrations before routing candidate traffic; migrations remain expand-only inside the rollback window.
2. Start API, require `/ready` success, then start Web. Run one synthetic tenant Worker invocation and prove no row remains `PROCESSING` under its worker ID.
3. Run the controlled suites, bind artifacts to the candidate commit and immutable image digests, then pass the protected attested launch-verification workflow.
4. Promote by digest through internal, pilot, canary and full waves. Stop on a P0 condition or unexplained reconciliation difference.
5. Before the first production write, a greenfield rollback may remove the candidate. After the first V6 write, use only a proven compatible application rollback, forward fix or verified V6 restore; never overwrite V6 facts with V5 data.
