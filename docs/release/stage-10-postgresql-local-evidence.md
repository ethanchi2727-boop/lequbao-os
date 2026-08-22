# Stage 10 local PostgreSQL evidence

Date: 2026-08-19

## Scope

This is local engineering evidence from a real PostgreSQL 15.19 x64 server listening only on `127.0.0.1:55432`. It is not a substitute for the independently reviewed controlled-environment manifest required by `launch:gate`.

## Results

- Clean `database/schema.sql`: 164 public tables and 26 recorded migrations.
- Clean-schema database fixtures: 22/22 passed in CI order, including RLS, immutable ledgers, payments, refunds, inventory, privacy, Agent runtime and platform controls.
- Incremental upgrade from the formal 73-table package baseline: migrations `0003` through `0026` passed, ending at the same 164 tables and 26 migration records.
- Distribution locking integration passed against PostgreSQL: exact allocation, dual approval, provider-evidenced payout, linked reversal and idempotent replay.
- Merchant intake integration passed twice with isolated random tenants: upload evidence, safe extraction, conflict retention, explicit confirmation, immutable commit and idempotent replay.
- Commerce inventory concurrency passed with ten simultaneous one-unit contenders against stock three: exactly three committed; seven failed; order, item, reserve-ledger, Outbox and idempotency counts were all exactly three.
- Worker fault injection passed on real PostgreSQL with a single-connection pool: transaction-local tenant state reset, tenant mismatch rejection, transient publish retry, Inbox deduplication, aggregate-version gap rollback, twelve-attempt dead-lettering and explicit original-event replay all converged without duplicate handling.
- A workspace-local `age` 1.3.1 encrypted logical-backup drill passed against a fresh restore database. The encrypted SHA-256 and frozen financial digest matched, one completed privacy deletion was re-enqueued, all 22 fixtures passed in an isolated disposable database, RPO was 97.01 seconds and RTO was 15.04 seconds. The restored business database was not mutated by fixtures.
- A real local API/PostgreSQL performance rehearsal passed with separate least-privilege employee-read and consumer-write identities: 20 requests per scenario at concurrency five, zero HTTP errors, core-read P95 455.35 ms, customer-message P95 153.20 ms, core-write P95 73.92 ms and 20/20 acknowledged message IDs present in PostgreSQL. This validates the harness only; it is not production-shaped performance evidence.
- Post-remediation local quality gate passed: Prettier, ESLint, contracts, RBAC, release and acceptance maps, visual assets, Workbench, OpenAPI, security, operations, deployment packaging, all six workspace type/build gates, 79 test files and 401 tests, including complete evidence-manifest, exact Workbench leaf coverage, Worker publisher, production UI policy, runtime configuration, multi-tenant WeCom resolver and production Web-server tests.
- Browser acceptance passed at 1440x900 and 390x844 with authoritative server data, no horizontal overflow and no console warnings or errors.

## Defects found and repaired

1. Migration `0011` used reserved word `authorization` as an SQL alias.
2. Migration `0011` contradicted its AUTHORIZE rule by making `mini_program_external_attempts.mini_program_id` non-null.
3. Migration `0013` recreated two immutable-ledger triggers without replacing the baseline triggers.
4. Migration `0026` referenced nonexistent `app.require_tenant_id()` instead of the repository tenant helper.
5. Revenue-right, operations and customer-service fixtures had schema or PostgreSQL-rendering drift.
6. Merchant-intake integration reused a committed fixture UUID and was not repeat-safe.
7. Order and related Outbox SQL used UUID parameters in text concatenation without preserving UUID parameter typing.
8. A real concurrent commerce integration was missing from CI; it is now included.
9. Worker retry/dead-letter/replay behavior lacked a real PostgreSQL fault-injection integration; it is now included in CI.
10. Restore verification ran fixed-ID fixtures in the restored business database and double-converted PowerShell JSON UTC timestamps. Fixtures now run in a fresh disposable database, argument paths are stable, cleanup is enforced and RPO uses the original timestamp offset.
11. The performance harness incorrectly required one Bearer token for incompatible employee and consumer identity boundaries and contained invalid PostgreSQL `FILTER` syntax. It now supports three scenario-scoped identities, writes a credential-free FAIL report for runtime faults, and passed both success and forced-database-failure rehearsals.
12. The production Worker entrypoint claimed Outbox rows but never published or settled them, and crashed `PROCESSING` rows were not reclaimable. The Worker now requires an HTTPS event gateway, publishes the full tenant/event contract with event-ID idempotency, settles every trusted outcome and reclaims locks older than five minutes; real PostgreSQL runtime publish/recovery passes.

## Remaining boundary

Formal production activation still requires the controlled result manifest, independent reviewer roles and external systems named in `stage-10-release-candidate-evidence.md`: official WeChat publish/rollback, payment/refund sandbox, GEO/plugin network isolation, physical/WAL and cross-fault-domain recovery evidence, production-shaped performance, the independently reviewed V5 zero-data inventory/greenfield waiver, identity/secrets/object/privacy infrastructure, and acknowledged on-call delivery. Any discovered V5 production record restores the full production-size migration requirement. No external credential-dependent result is claimed here.
