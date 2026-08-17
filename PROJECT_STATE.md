# Project state — V6.1 rebuild

## Active branch

`upgrade/v6.1-rebuild`

The remote `main` branch at commit `f70b4674c82f99db8424bba8854aeb8a7a11d362` is the preserved V5 rollback baseline.

## Current objective

Rebuild the repository around the V6.1 `乐趣宝 + 乐趣生活` baseline. Preserve verified business behavior and migration evidence, but do not preserve the V5 application topology, naming, SQLite persistence, or UI architecture merely for compatibility.

## Completed in this stage

- Located and checksum-verified the V6.1 formal package.
- Read the external unique baseline and current `00`–`07` package entry points.
- Inspected the product boundaries, commercial rules, page tree, state machines, UI overview, PostgreSQL schema, OpenAPI, events, RBAC, test gates, repository strategy, and development instructions.
- Created the V6.1 rebuild branch.
- Recorded frozen development rules and known package conflicts.
- Vendored the verified `00`–`07` source package and repaired the generated migration's literal diff markers.
- Completed the V5→V6 keep/rewrite/migrate matrix; V5 remains recoverable from `main` and Git history.
- Replaced the V5 workspace with a pnpm modular-monolith foundation: shared contracts, Fastify API and RLS-safe Outbox Worker.
- Imported the 73-table PostgreSQL 15+ schema and added a real-database CI gate that attempts cross-tenant reads and writes.
- Added immutable audit/ledger checks, strict money/event contracts, deterministic builds, exact dependency locking, lint, type, unit-test and build gates.
- Implemented the first revenue vertical slice: unique merchant permanent-right activation, multi-holder 70% validation, transactional idempotency, audit and `revenue_right.activated.v1` Outbox publication.
- Implemented frozen subscription policy V1 (`70/10/20`) with deterministic minor-unit allocation that never loses a cent.
- Implemented statement math for receipts, refunds, actual/provisional/reversed direct costs, zero-floor loss handling and exact multi-party allocation.
- Added migration `0003` with deferred PostgreSQL constraints that reject locked statements unless shares total 100% and allocations reconcile to the cent; distribution entries remain append-only.
- Published a deliberately implementation-bounded OpenAPI document and added syntax/reference drift checks.

## Verified package facts

- 583 checksummed files, zero checksum mismatches.
- 307 page nodes and 197 leaf pages.
- 73 PostgreSQL tables, 37 target OpenAPI paths, 46 domain events.
- 15 roles, 51 permission controls, and 143 acceptance tests.
- The existing V5 repository has 134 OpenAPI paths and approximately 136 SQLite tables; replacement requires an explicit compatibility and migration matrix.

## Current blockers and risks

- The delivered migration contained literal `+` patch markers. The repository copy and generator are repaired and guarded against recurrence.
- The frozen `70/10/20` distributable-income policy conflicts with a separate `25%` channel-distribution statement. V6.1 development uses the frozen versioned policy; production payout needs written business and finance resolution.
- Current material mixes `商务人员` and `商务推广人员`, and mixes `生活消费` and `生活`. The external unique baseline wins pending formal amendment.
- The target stack recommendation differs from the V5 implementation. The rebuild must use architecture decision records and must not mix package managers or duplicate long-lived app implementations.
- Local formatting, lint, contract counts, OpenAPI, TypeScript, 34 unit tests and production builds pass.
- GitHub Actions run `32039457455` passed clean PostgreSQL 15 schema application and RLS isolation for commit `8da963b`.
- GitHub Actions run `32040005789` passed the revenue-right and frozen-policy PostgreSQL constraint test for commit `cb98f7b`.
- The exact distribution reconciliation and immutable-ledger PostgreSQL test is added locally and awaits the next pushed CI run.
- Payment sandbox, WeCom callbacks, backup recovery, migration dry-run/rollback and browser/WeChat acceptance remain unverified.

## Exact next step

Commit and push the distribution invariant, observe its real PostgreSQL test, then implement the transactional statement-locking service and API: source amount verification, actual-cost query, active policy/right lookup, allocation/accrual insertion, audit and Outbox event.
