# Stage 9 — operations, security, migration and disaster recovery

## Implemented controls

- Migration `0015` adds tenant-scoped runs, leased cursors, immutable old/new ID mappings, three-level reconciliation, review queues, privacy deletion targets and operational alert evidence. Switch/Contract is database-blocked when reconciliation is missing or contains any unexplained difference.
- The migration engine splits legacy combined order/payment/verification/refund states, resumes only after a committed primary-key cursor, hashes batch inputs/outputs, treats exact writes as replays, disables unowned accounts and omits consent without its original evidence.
- Customer deletion automatically fans out to primary database, object storage, search, vector and cache targets. Each target has its own durable idempotency key; restoration enqueues deletion replay before a restored environment can be promoted.
- Every API response receives trace ID and restrictive content, framing, referrer, permissions and cross-origin headers. Operational redaction removes credentials, tokens, phone, addresses and message/content fields recursively.
- Authenticated Prometheus output exposes route-level request, failure and rolling P95 values with bounded cardinality and without tenant/customer labels.
- Source scanning rejects private keys, GitHub/AWS tokens, credential URLs and JWT-shaped secrets. A deterministic CycloneDX 1.6 SBOM contains 249 pinned lockfile components and is cryptographically bound to `pnpm-lock.yaml`. CI additionally rejects high/critical production dependency advisories.
- Fourteen alert rules cover every mandatory launch signal and map P0/P1 cases to selective freeze actions. Core transaction/customer-service availability is not coupled to a plugin or GEO circuit.
- Encrypted backup, new-database restore, post-restore privacy replay, P0 response, migration compatibility rollback and threat/data-flow runbooks are repository owned. The portable restore drill verifies the encrypted hash and frozen per-tenant financial digest, requires observable deletion replay, executes every database fixture, measures the five-minute RPO/sixty-minute RTO and writes a durable report. The performance harness measures concurrency, duration, P50/P95/P99 and error rate against the frozen 500/800 ms thresholds, proves acknowledged customer messages in PostgreSQL, captures database and Outbox evidence and writes a non-overwriting JSON report.
- The workbench now exposes bounded write commands for delivery start/resume/suspend and step execute/retry, mini-program review/publish/rollback, and customer-service accept/return-to-AI/close. Paths and bodies come only from a page-specific registry, every write carries a fresh idempotency key, destructive/high-impact actions require a visible confirmation, and generic contract actions stay disabled until a real write contract exists.

## Acceptance mapping

- MIG-001: clean and incremental PostgreSQL 15 jobs apply all migrations through 0015.
- MIG-002/007/008: unit tests cover combined state split, missing-consent omission and ambiguous-account disablement.
- MIG-003/004: immutable ID mappings, exact hashes and commit-after-write cursors cover idempotency and interruption resume.
- MIG-005: schema requires tenant/day, tenant-total and global-total summaries; unexplained differences block Switch.
- MIG-006: expand-only compatibility and feature flags preserve rollback without overwriting post-migration orders.
- SEC-001: source secret scan, deterministic SBOM and CI production audit are required by `pnpm check`/CI.
- SEC-002/003: callback replay tests from earlier stages remain in the full gate; database fixtures retain immutable audit evidence.
- PRI-003: restored deletions are re-enqueued with per-target idempotency.
- DR-002: GEO and plugin failures remain target/installation local; commerce and customer-service APIs have no dependency on their gateways.

## Controlled-environment evidence still required in Stage 10

- No PostgreSQL server, production-size legacy snapshot, backup encryption identity or provider credentials are installed locally. Therefore MIG-001 database execution, two full migration rehearsals, DR-001 measured RPO/RTO and restored financial reconciliation are wired but not claimed as executed here.
- No deployed pre-production API exists locally, so PERF-001/002 results are not fabricated. The checked-in harness must run against controlled pre-production with its environment, volume, concurrency, duration and error evidence recorded.
- The on-call contact is deployment data, not a personal value committed to a public repository. Stage 10 must verify a real 24-hour contact and alert delivery path.
- A live environment audit on 2026-08-19 found no local `docker`, `podman`, `psql` or `pg_isready`, no `DATABASE_URL`, and no configured payment, WeChat, object-store, GEO or verification credentials. The final PostgreSQL 15 clean/incremental job now includes migrations through `0026` and all database fixtures, including explicit rejection/authorization paths for the platform merchant directory, but it cannot be executed before the user-authorized final push or equivalent controlled infrastructure is supplied.
