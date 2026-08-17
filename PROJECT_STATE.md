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
- Audited the package's distribution inputs and added migration `0004`: an immutable, provider-event-idempotent subscription receipt/refund ledger. The target now has 74 tables while the vendored source remains checksum-accounted at 73.
- Implemented transactional subscription statement locking. It derives amounts from the cash ledger and cost entries, resolves the active policy/right holders, allocates exactly, writes accruals/audit/Outbox/idempotency atomically, and never accepts client-supplied money.
- Published a deliberately implementation-bounded OpenAPI document and added syntax/reference drift checks.
- Corrected minor-unit residual handling so subscription rounding tails always enter the `LEQU_LIFE` allocation rather than a generic largest-remainder recipient.
- Added migration `0005` with dual-control distribution approvals, immutable provider payout evidence, exact original-entry linkage and append-only payout/reversal ledger constraints. The audited target now has 76 tables.
- Implemented separate request, different-person approval, payout and reversal commands. Every command has its own idempotency scope; finance membership is revalidated at approval and execution; payment requires one unique provider-reference hash per positive allocation.
- Implemented `ACCRUAL -> PAYMENT -> REVERSAL` linkage for paid statements and `ACCRUAL -> REVERSAL` for unpaid statements, with audit and financial Outbox events committed in the same transaction.
- Expanded the implementation-bounded OpenAPI from five to nine paths.

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
- The current API foundation has no signed session-token authentication. Settlement actor IDs are checked against active platform-finance membership but still arrive as command input; the new settlement endpoints must not be production-exposed before token-derived actor identity and permission middleware exist.
- Failed provider attempts and callback-driven retry orchestration are not yet implemented. Successful payouts are evidence-bound and immutable, but a payment connector sandbox remains required.
- Local formatting, lint, contract counts, nine implemented OpenAPI paths, TypeScript, 39 unit tests and production builds pass.
- GitHub Actions run `32039457455` passed clean PostgreSQL 15 schema application and RLS isolation for commit `8da963b`.
- GitHub Actions run `32040005789` passed the revenue-right and frozen-policy PostgreSQL constraint test for commit `cb98f7b`.
- GitHub Actions run `32040375789` passed exact distribution reconciliation and immutable-ledger tests for commit `b88903f`.
- GitHub Actions run `32040722489` passed the subscription cash-source ledger and incremental 73→74-table migrations for commit `8a03bda`.
- GitHub Actions run `32041550030` passed the statement-locking PostgreSQL fixture for commit `cee60da`, including exact allocations, one statement/event/audit set and identical idempotent replay.
- GitHub Actions run `32042648486` passed commit `b5b3612`: clean and incremental PostgreSQL 15 schemas, dual-control constraints, provider-evidenced payout, linked paid-statement reversal and identical command replays.
- Payment sandbox, WeCom callbacks, backup recovery, migration dry-run/rollback and browser/WeChat acceptance remain unverified.

## Exact next step

Implement the AI conversation intake vertical slice from asset ingestion through extraction candidates, explicit high-risk field confirmation and committed merchant profile output. Keep AI proposals non-authoritative and derive actor identity from the authentication boundary rather than request bodies.
