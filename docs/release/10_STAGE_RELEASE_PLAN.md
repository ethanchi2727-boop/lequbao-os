# V6.1 ten-stage release plan

## Purpose

This plan converts the frozen V6.1 source package into ten executable development stages. It is derived from the 307-node page tree, 143 acceptance tests, security launch baseline, stop-release conditions and the official stage 0–7 roadmap. A stage is complete only when its code, contracts, tests and build evidence exist in this repository.

No stage in this run is committed or pushed independently. Changes accumulate in the working tree until all ten stages have completed and the user has reviewed the final report.

## Audited baseline

| Contract                    | Frozen count | Current evidence                                                                                  |
| --------------------------- | -----------: | ------------------------------------------------------------------------------------------------- |
| Page nodes                  |          307 | Source package checksum and contract gate                                                         |
| Executable leaf pages       |          197 | 135 乐趣宝, 38 乐趣生活, 24 merchant-template pages                                               |
| Acceptance tests            |          143 | 46 core P0 plus 97 extended tests                                                                 |
| Source database tables      |           73 | Imported PostgreSQL 15+ schema                                                                    |
| Audited target tables       |          164 | Twenty-six migrations; includes customer service and platform control-plane evidence              |
| Source OpenAPI paths        |           37 | Frozen package contract                                                                           |
| Implemented OpenAPI paths   |          193 | Implementation-bounded employee, consumer, operations, subscription and Agent APIs                |
| Domain events               |           46 | Frozen package contract; implementation remains partial                                           |
| Roles / permission controls |      15 / 51 | Frozen matrix is generated into 213 scoped grants and enforced on every implemented protected API |

## Current implementation boundary

Already evidenced and not to be rebuilt:

- deterministic pnpm workspace, formatting, lint, type, unit, build and PostgreSQL CI;
- PostgreSQL RLS and immutable audit/ledger foundations;
- permanent subscription revenue right, 70/10/20 statement math, approval, payout and reversal;
- signed merchant-intake session, secure upload tickets, malware-first extraction pipeline and WeCom intake callback;
- PAGE-014 and PAGE-175–178 with PC/mobile browser acceptance.

Material gaps that prevent a production launch:

- real identity-provider gateway/device/MFA evidence for the implemented one-time assertion exchange, plus accountable organization/member administration review;
- real WeChat component-platform credentials, callback registration and controlled release evidence;
- AI customer service, customer privacy lifecycle and human takeover concurrency;
- product, inventory, order, payment, refund, verification, reward and reconciliation services;
- 144 remaining fail-closed executable leaf pages requiring authoritative journey integration;
- GEO, value reports, plugin sandbox, egress restrictions and circuit breakers;
- greenfield zero-data inventory (or full legacy migration if any record exists), backup restoration, performance, monitoring, alerting and compliance evidence;
- real WeChat, WeCom, payment and provider credentials and controlled pre-production infrastructure.

## The ten stages

### Stage 1 — release inventory and executable coverage map

Account for every frozen page and acceptance test, define the ten-stage ownership map, preserve verified work and add a gate that fails when source counts or stage mappings drift.

Completion evidence: `pnpm release-plan:check`, typecheck and production build.

### Stage 2 — identity, tenant, permission and financial foundation

Complete login/session revocation, organization and member lifecycle, role/data-scope enforcement, package entitlement and AI usage ledgers. Close the remaining permanent-right, direct-cost, subscription, compute-package and voucher P0 cases without weakening the existing immutable financial model.

Status: completed locally. Evidence includes generated 15-role/51-permission/213-grant RBAC, live database authorization, device-bound rotating sessions, tenant switching/revocation, immutable entitlement snapshots and AI usage facts, compute/voucher policies, and dual-confirmed revenue-right transfer/dispute governance. The full repository gate passes with 92 unit tests and production builds. PostgreSQL integration tests are wired into CI but remain unexecuted locally because no PostgreSQL runtime is installed and this run forbids pushing.

### Stage 3 — merchant master and one-click delivery

Complete merchant master data, intake handoff, resumable delivery projects, required steps, checkpoints, targeted retries, receipts, temporary business access expiry and an exception center.

Status: completed locally. The frozen `merchant_delivery_standard` workflow contains 38 versioned steps and durable execution attempts. Missing merchant facts and AppID authorization stop before provider calls; payment, price, refund, mini-program name and WeChat-review confirmations are enforced in both application and database boundaries. Partial GEO results preserve successful targets, targeted retry increments only the failed step action version, unknown provider results block blind retries, and required-step acceptance writes an immutable checklist receipt. Partner access is assignment-scoped and expires within 30 days. Local TypeScript and 80 API tests pass; the new PostgreSQL fixture is wired into CI but cannot run locally without PostgreSQL and cannot run remotely before the user-authorized final push.

### Stage 4 — merchant shared-template mini-program lifecycle

Implement merchant-owned AppID authorization, secret references, template configuration, experience build, legal confirmation, review submission, rejection continuation, production release, staged upgrade, authorization loss and rollback.

Status: completed locally. Merchant-owner authorization exchanges one-time codes without persisting them, stores only approved secret references and enforces global AppID ownership. Canonical configuration and immutable build evidence drive experience versions; the assigned publishing confirmer must complete all eleven name, visual, commercial, category, payment and privacy checks before review. Signed safe-mode callbacks are freshness checked, durably retain encrypted originals and converge exact replays. Review rejection remains recoverable, publish timeout actively queries the online version instead of blindly repeating, rollout advances through internal/pilot/canary/all waves, authorization loss blocks the delivery chain, and rollback creates a new release while retaining every prior build. The eight frozen MP P0 cases, four callback-boundary cases and HTTP wiring are covered; the full local gate passes with 93 API tests and 118 repository tests. The PostgreSQL fixture is wired into clean-schema CI but cannot execute locally without PostgreSQL and cannot execute remotely before the final user-authorized push.

### Stage 5 — AI customer service and privacy

Implement durable customer-service conversations, source-grounded answers, risk-to-human routing, atomic claim/transfer/return-to-AI, merchant knowledge, customer-profile consent/expiry and WeCom internal notifications without personal-WeChat access.

Status: completed locally. Consumer content is durably stored before message IDs are returned; only current, exact-tenant/store knowledge and validated read-only business tools can ground an AI answer. Missing sources, failed tools, prompt-injection scope escapes, low confidence, refunds, complaints and safety cases converge to one durable human queue without invented promises. Employee claim is atomic, sender identity is server-derived, post-takeover AI answers are cancelled, and explicit return-to-AI is required. In-app notification survives optional internal-WeCom failure. Knowledge publication is store-scoped, version-immutable, expiring and auditable. Continuous customer-profile facts retain source, purpose, confidence and expiry; consumer view, correction, delete, restrict and consent withdrawal are supported, and employee正文 reads are separately audited. CS-001–CS-010 plus knowledge/privacy/content-read boundaries pass. The full local gate passes with 101 target tables, 57 implemented OpenAPI paths, 117 API tests and 143 repository tests. The PostgreSQL fixture is wired into clean-schema CI but remains unexecuted locally because PostgreSQL is unavailable and this run forbids pushing.

### Stage 6 — transaction, fulfilment, aftercare and reconciliation

Implement product/inventory/order state, merchant-direct payment, signed idempotent callbacks, verification, partial/full refund, aftercare, isolated reward ledger and end-of-day reconciliation with explainable difference cases.

Status: completed locally. Migration `0013` raises the audited target to 111 tables and adds database-final inventory reservation, immutable order/payment/refund/verification/reward history, refund-scope reconciliation, merchant-account binding and one-cent reconciliation stops. Consumer order creation ignores client money, locks variants deterministically and releases expiry once. Provider payment credentials use confirmed merchant accounts; exact raw callback bytes are HMAC verified, stored before processing and converge repeated success/failure without trusting the client. Partial refunds derive item amounts from paid allocations, snapshot approval policy and require different-person approval when triggered. Opaque verification tokens contain no order plaintext and are checked again by a row-locking database trigger for store, time, risk, generation and quantity. Reward grant/reversal uses balanced append-only entries linked to the original transaction. Daily reconciliation compares provider evidence with payment, refund, order, reward and verification facts, and any one-cent or missing-record discrepancy stops as `DIFFERENCE_FOUND`. Production-shaped provider adapters, 11 HTTP paths and tenant-safe worker expiry/refund jobs are wired. All ORD/PAY/REF/VER/REW/REC P0 cases have application or database evidence; the full local gate passes with 111 target tables, 68 OpenAPI paths, 141 API tests and 168 repository tests. The PostgreSQL fixture is wired into clean/incremental CI but remains unexecuted locally because PostgreSQL is unavailable and this run forbids pushing.

### Stage 7 — 乐趣生活 and merchant consumer surfaces

Build the five frozen 乐趣生活 entrances and the consumer/merchant-template P0 journeys. Every leaf route must expose its contracted eight states and use repository-owned visual assets rather than placeholders.

Status: completed locally. Two native WeChat mini-program packages build from repository source and map all 38 consumer and 24 merchant-template leaves with the frozen eight states, tabs and visual assets. Follow-up remediation removed static commerce fallbacks and connected every mini-program leaf to authenticated, account/store-scoped APIs. Real WeChat devices, locations and provider credentials remain Stage-10 controlled-environment evidence rather than local completion claims. See `LAUNCH_READINESS_AUDIT.md`.

### Stage 8 — GEO, value reports and official plugins

Implement permissioned publishing, freshness/difference monitoring, traceable monthly metrics, plugin manifests and grants, declared-domain egress, version reauthorization, uninstall cleanup and independent circuit breakers. Add 2–3 pilot industry templates.

Status: completed locally. Migration `0014` raises the audited target to 118 tables. Merchant-confirmed GEO facts are validated and submitted one authorized target at a time; response evidence and provider `retry_after` are durable, and a tenant-safe worker checks authorization, accessibility and name/address/phone/business-hours hashes without overwriting successful sibling targets. Forbidden claims about inclusion, rank, traffic or conversion fail policy tests. Monthly value reports are idempotent immutable snapshots built from versioned metric definitions and exact source event IDs, with generation cutoff and GEO non-ranking disclaimer. The official plugin directory exposes only published first-party versions; owner-confirmed exact grants, manifest-bound permission codes, HTTPS hostname allowlists, committed denial receipts, per-installation circuits, expansion reauthorization, token generation and uninstall deletion receipts enforce PLG-001–006. Dining, local-retail and leisure-service pilot templates are repository owned. The implemented OpenAPI now contains 77 paths. Local TypeScript and targeted tests pass; PostgreSQL fixtures and real channel/runtime behavior remain explicit Stage-10 controlled-environment gates.

### Stage 9 — operations, security, migration and disaster recovery

Implement migration cursors/reconciliation, privacy export/delete propagation, secret and SBOM scans, production security headers, structured logs/traces/metrics, P0 alert runbooks, backup restoration and rollback drills. Provider-dependent drills use controlled pre-production resources only.

Status: completed locally. Migration `0015` raises the audited target to 125 tables and introduces resumable tenant/entity cursors, immutable ID/hash mappings, mandatory tenant-day/tenant/global reconciliation, safe manual-review items, multi-target privacy deletion and operational alert evidence. Unknown legacy state is never guessed, consent without evidence is omitted, unowned accounts remain disabled, and Switch/Contract is database-blocked without complete zero-unexplained-difference verification. APIs now add hardened browser headers and trace IDs; authenticated low-cardinality metrics, recursive log redaction, 14 mandatory alert rules and selective freeze runbooks cover the security baseline. A deterministic 249-component CycloneDX SBOM is lockfile-bound, repository secret scanning is part of the local gate, and CI also executes a production dependency audit. Encrypted backup/fresh restore, deletion replay, expand-only rollback and performance tools are ready for controlled-environment Stage-10 execution. Local TypeScript, 197 tests, 78 OpenAPI paths and all builds pass; no local result is substituted for the missing PostgreSQL, production-size snapshot, on-call delivery or pre-production load/restore evidence.

Greenfield amendment (2026-08-19): the owner has confirmed that V5 was never used and authorized a breaking replacement. Stage 10 therefore requires a controlled, independently reviewed inventory proving zero production records across every formerly deployable V5 store. This is not an automatic waiver: one discovered legacy record stops release and restores the original two-production-size-rehearsal, resumable-cursor and three-level-reconciliation requirements.

### Stage 10 — release candidate and launch evidence

Run all 143 mapped acceptance cases, real PostgreSQL and RLS suites, concurrency and fault injection, performance thresholds, browser matrices, WeChat builds and provider sandboxes. Produce a release manifest, migration/rollback package, reconciliation report and explicit list of any credential-dependent gates.

Status: local release-candidate product scope is complete; production activation remains blocked. All 135 乐趣宝 leaves resolve from the frozen page contract with eight states and authoritative APIs, so all 197 leaves across three products are now locally authoritative. The latest closures add owner-scoped sales, dual-controlled subscription changes, typed intake/data confirmation, WeChat authorization, mini-program release governance, trusted knowledge, cost evidence, immutable appeals, bounded employee Agent execution, tenant-timezone operations, scoped GEO publication/differences, customer-service duty/tasks/quality, reward rules, official plugin/skill catalogs, platform merchant/plan/partner/model controls, immutable conversion reports and idempotent group-buy publication. All 143 cases remain evidence-mapped: 111 local automated, 3 locally reviewed and 29 controlled-environment pending. `pnpm launch:gate` remains red until PostgreSQL, provider, WeChat, backup/restore, performance, identity and on-call evidence is attached in a manifest whose candidate commit, current plan, suite reviews and file hashes all verify. See `stage-10-release-candidate-evidence.md`.

## Stop rules

Work stops immediately for an unexplained financial mismatch, cross-tenant exposure, irreversible migration defect, secret exposure, destructive data risk or a repeated build failure without a bounded fix. Missing real credentials does not permit simulated evidence to be described as production evidence.

## Stage ownership of acceptance tests

`release-stage-map.json` assigns all 143 test IDs by prefix to stages 2–10. Stage 1 owns the map itself. The verification script rejects missing/duplicate mappings, changed frozen counts, duplicate leaf routes and leaf pages without all eight contracted states.
