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
- Added a signed session identity boundary for the new merchant-intake APIs. Tenant, actor and roles come from an HS256 Bearer token and active database membership is revalidated on every command.
- Added migration `0006` and the immutable `merchant_intake_commits` snapshot. Candidate inserts now require a same-session asset whose security and processing states are `SAFE/SUCCEEDED`; confirmations and commits are append-only. The audited target now has 77 tables.
- Implemented the trusted AI merchant-intake domain slice: idempotent session creation, immutable asset metadata, security rejection, safe extraction results, multi-source conflict retention, typed human confirmation and atomic formal merchant-profile commit with audit and Outbox.
- Expanded the implementation-bounded OpenAPI from nine to fourteen paths.
- Added migration `0007` and tenant-scoped upload tickets. Object keys, SHA-256, MIME type, byte ceiling and expiry are signed; completion trusts only storage-side HEAD evidence and consumes a ticket exactly once. The audited target now has 78 tables.
- Added the ordered intake processing boundary: malware verdict precedes OCR/document/ASR extraction, unsafe material never reaches a model, and structured candidates can only be persisted through the trusted application service. HTTP adapters validate upstream responses and turn extraction outages into retryable failed assets without deleting raw material.
- Added text-message ingestion through deterministic tenant object keys and the same immutable asset queue.
- Added verified enterprise WeCom internal-app callbacks: callback freshness, SHA-1 signature, AES-CBC/PKCS#7 decryption, corp identity, member binding, message/payload idempotency and expired-media retry evidence. It does not read or answer employee personal WeChat contacts.
- Replaced the old client-supplied object-key endpoint with upload authorization and completion endpoints. The implementation-bounded OpenAPI now has seventeen paths.
- Accepted ADR-0004 and added the only active 乐趣宝 Web runtime for PAGE-014 and PAGE-175–178. PC and mobile H5 share state and confirmation rules, with explicit loading, empty, recoverable error, denied, stopped and success presentations.
- Connected the Web runtime to the implementation-bounded APIs in non-demo mode: signed employee session bootstrap, existing/new intake loading, text ingestion, SHA-256 upload-ticket flow, storage PUT completion, candidate rendering with HTML escaping, legal confirmation and guarded commit. Demo mode remains explicit and cannot be mistaken for a live API session.

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
- Object storage, malware, OCR, speech and structured-extraction adapter contracts are implemented and fault-tested, but no production provider credentials were supplied; real provider calls remain an integration gate.
- Enterprise WeCom cryptography, tenant/member binding and receipt idempotency are implemented and simulated with official message framing. A real enterprise application callback and expired-media download still require controlled credentials.
- PAGE-014 and PAGE-175–178 are implemented and their shared state tests/build pass. The local page server responds, but the Codex in-app browser control runtime failed to initialize with a missing internal asset path, so visual browser acceptance is not yet evidence-backed.
- Local formatting, lint, 78-table contract counts, seventeen implemented OpenAPI paths, TypeScript, 61 unit tests and all production builds pass.
- GitHub Actions run `32039457455` passed clean PostgreSQL 15 schema application and RLS isolation for commit `8da963b`.
- GitHub Actions run `32040005789` passed the revenue-right and frozen-policy PostgreSQL constraint test for commit `cb98f7b`.
- GitHub Actions run `32040375789` passed exact distribution reconciliation and immutable-ledger tests for commit `b88903f`.
- GitHub Actions run `32040722489` passed the subscription cash-source ledger and incremental 73→74-table migrations for commit `8a03bda`.
- GitHub Actions run `32041550030` passed the statement-locking PostgreSQL fixture for commit `cee60da`, including exact allocations, one statement/event/audit set and identical idempotent replay.
- GitHub Actions run `32042648486` passed commit `b5b3612`: clean and incremental PostgreSQL 15 schemas, dual-control constraints, provider-evidenced payout, linked paid-statement reversal and identical command replays.
- GitHub Actions run `32047162811` passed commit `c8236a5`: clean and incremental 73→77-table PostgreSQL 15 schemas, intake safety/immutability guards, signed-role service flow, rejected-file blocking, conflict retention, explicit confirmation, formal commit and idempotent replays.
- GitHub Actions run `32055811314` passed commit `fd29d49`: all code-quality gates plus clean and incremental 73→78-table PostgreSQL 15 schemas, upload-ticket immutability, object-evidence completion, signed internal WeCom/text boundaries and the trusted merchant-intake integration replay.
- Payment sandbox, real WeCom/provider callbacks, backup recovery, migration rollback drill and browser/WeChat acceptance remain unverified.

## Exact next step

Run PAGE-014 and PAGE-175–178 visual acceptance once the in-app browser runtime is available, then connect controlled object-storage/scanner/OCR/ASR and enterprise WeCom sandboxes. Keep production enablement blocked until provider, backup/restore and rollback evidence is attached.
