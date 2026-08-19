# V6.1 fifty-stage launch plan

## Rule

This is the canonical decomposition of the frozen V6.1 scope into fifty independently reviewable stages. It preserves completed evidence instead of rebuilding it. A `local-complete` stage has repository-bound code and self-check evidence; a `controlled-pending` stage requires real infrastructure, credentials, devices or accountable human approval and cannot be passed with simulated evidence.

The machine-readable source is `50-stage-release-plan.json`. The release gate rejects missing stages, duplicate acceptance ownership, missing evidence paths, count drift or a controlled stage mislabeled as locally complete.

## Status summary

- Stages 1–46: locally complete, with exact source, test, database, browser or CI evidence.
- Stages 47–50: controlled-environment pending.
- Frozen coverage: 307 page nodes, 197 executable leaves and 143 acceptance cases.
- Current acceptance evidence: 111 local automated, 3 locally reviewed and 29 controlled pending.
- Launch remains blocked until every controlled case, all seven external gates and every stop-release condition are independently reviewed green.

## Current execution checkpoints

| Stages | 2026-08-19 self-check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01–05  | Fifty-stage manifest gate passed; 307 nodes, 197 leaves and 143 cases are exact. Tooling tests passed 14/14, both mini-program packages built, and CI YAML parsed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 06–10  | V6 contract gate passed at 73 source/164 target tables with RLS and audit guards. Frozen RBAC passed at 15 roles/51 permissions. API identity/access tests passed 15/15 and both API TypeScript projects passed. GitHub PostgreSQL job `95990086263` passed clean/incremental schema, every SQL fixture, concurrency and Worker fault injection against candidate `8b58ddc`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11–15  | Organization, entitlement, revenue-right, subscription cash, distribution and voucher suites passed 47/47. API TypeScript passed after the grouped self-check; the same candidate PostgreSQL job passed revenue, cash-ledger, payout and reversal fixtures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 16–20  | Intake, object boundary, enterprise-WeCom, sales and subscription suites passed 38/38. API source and integration TypeScript projects both passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 21–25  | Delivery, mini-program lifecycle/callback, discovery/store switch, cart/checkout and payment suites passed 61/61. API TypeScript passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 26–30  | Order, refund/aftercare, verification, reward/merchant operations and reconciliation suites passed 40/40; Worker commerce expiry/refund suite passed 1/1. API and both Worker TypeScript projects passed. Legacy E8J files reported in an earlier task were confirmed as intentionally deleted V5 topology retained in Git history, not missing V6.1 source.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 31–35  | Workbench passed 29/29 plus typecheck/build; consumer and merchant mini-programs each passed 3/3, exact 38/24-leaf verification and build. Customer-service API passed 24/24 and Worker AI passed 1/1; both source typechecks passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 36–40  | GEO/plugin, employee-Agent and platform-control API suites passed 32/32. Privacy export/delete, GEO monitoring and Agent Worker suites passed 6/6. API and both Worker TypeScript projects passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 41–45  | Outbox/publisher/runtime/migration Worker suites passed 19/19; observability passed 3/3; restore/performance tooling passed 7/7; operations and security gates passed over 13 alerts, 463 text files and 249 SBOM components. Prior local evidence was revalidated at RPO 97.01 s, RTO 15.04 s, 22 fixtures, zero performance errors and P95 455.35/153.20/73.92 ms. A fresh performance invocation without staging URL, database, scenario bodies and three scoped tokens correctly failed closed; this does not satisfy the production-shaped controlled gate.                                                                                                                                                                                                                                                 |
| 46     | OpenAPI passed at 193 implemented paths and deployment definitions passed. The production identity-exchange boundary requires gateway allow/rate-limit evidence, strips extra client identity fields, derives source risk context through exact trusted proxy CIDRs and transactionally audits successful login/switch events with keyed hashes. API and Worker reject placeholder/short secrets, insecure or loopback gateways, non-TLS PostgreSQL, invalid address keys and invalid Worker tenant UUIDs. The controlled-preflight workflow executes only trusted default-branch code while inspecting a resolved candidate. The Linux-only mini-program regression is covered; both push and PR executions passed code-quality, PostgreSQL and three-container jobs for the published conflict-free candidate. |
| 47–50  | Still controlled pending. The reviewed preflight is on `main`; `controlled-preproduction` requires review, prevents self-review and is restricted to the `main` workflow ref. Application-owned keys and the candidate binding are provisioned without exposing values. Current name coverage is 2/15, 3/9, 6/28 and 1/2 for Stages 47–50. Real provider/deployment values, a second reviewer and controlled results remain absent, so no external PASS is claimed.                                                                                                                                                                                                                                                                                                                                              |

The published GitHub candidate passes all three production container builds, fail-closed runtime smoke, PostgreSQL contracts and the full code-quality gate. The earlier Linux-only mini-program output-boundary false positive is fixed and covered by a cross-platform regression test.

The final local repository gate is green after production-runtime and identity risk/audit hardening: formatting, lint, every static contract, 82 test files/414 tests, eight type/contract checks and all six production builds passed. `launch:gate` then failed closed exactly at `CONTROLLED_RESULTS_FILE is required for launch`; changing that result without the eleven real, independently reviewed suite bundles is forbidden.

## Fifty stages

| Stage | Boundary                                        | Status             |
| ----: | ----------------------------------------------- | ------------------ |
|    01 | Source package integrity                        | Local complete     |
|    02 | Product boundary and frozen decisions           | Local complete     |
|    03 | Page tree and route inventory                   | Local complete     |
|    04 | Acceptance inventory and evidence ownership     | Local complete     |
|    05 | Modular monolith and runtime boundary           | Local complete     |
|    06 | PostgreSQL target schema                        | Local complete     |
|    07 | Incremental migrations and greenfield guard     | Local complete     |
|    08 | Row-level tenant and store isolation            | Local complete     |
|    09 | Immutable audit and idempotency                 | Local complete     |
|    10 | Sessions and frozen RBAC                        | Local complete     |
|    11 | Organization membership and access governance   | Local complete     |
|    12 | Entitlement and AI usage ledger                 | Local complete     |
|    13 | Permanent revenue rights                        | Local complete     |
|    14 | Subscription cash and statement locking         | Local complete     |
|    15 | Cost distribution payout and vouchers           | Local complete     |
|    16 | Merchant conversational intake                  | Local complete     |
|    17 | Object malware OCR and speech pipeline          | Local complete     |
|    18 | Enterprise WeCom callback isolation             | Local complete     |
|    19 | Sales evidence and merchant activation          | Local complete     |
|    20 | Contracts collections and subscriptions         | Local complete     |
|    21 | One-click delivery workflow                     | Local complete     |
|    22 | Merchant mini-program lifecycle                 | Local complete     |
|    23 | Consumer discovery catalog and store switch     | Local complete     |
|    24 | Cart quote and checkout                         | Local complete     |
|    25 | Merchant-direct payment                         | Local complete     |
|    26 | Order fulfillment and expiry                    | Local complete     |
|    27 | Refund and aftercare                            | Local complete     |
|    28 | Verification credentials                        | Local complete     |
|    29 | Consumer reward ledger                          | Local complete     |
|    30 | Financial reconciliation                        | Local complete     |
|    31 | Consumer mini-program surface                   | Local complete     |
|    32 | Merchant mini-program surface                   | Local complete     |
|    33 | Workbench authoritative surface                 | Local complete     |
|    34 | AI customer service and human takeover          | Local complete     |
|    35 | Grounded AI and safe tools                      | Local complete     |
|    36 | Customer profile and privacy lifecycle          | Local complete     |
|    37 | GEO evidence and freshness monitoring           | Local complete     |
|    38 | Plugin and official skill sandbox               | Local complete     |
|    39 | Bounded employee Agent                          | Local complete     |
|    40 | Platform control plane                          | Local complete     |
|    41 | Worker Outbox and fault recovery                | Local complete     |
|    42 | Observability alerts and freeze controls        | Local complete     |
|    43 | Backup restore and disaster recovery            | Local complete     |
|    44 | Performance and capacity gate                   | Local complete     |
|    45 | Security threat model SBOM and secret scan      | Local complete     |
|    46 | OpenAPI containers and CI release candidate     | Local complete     |
|    47 | Controlled identity object and enterprise WeCom | Controlled pending |
|    48 | Controlled WeChat release and payment sandbox   | Controlled pending |
|    49 | Production-shaped staging on-call and pilot     | Controlled pending |
|    50 | Cutover go-no-go and launch approval            | Controlled pending |

## Completion boundary

Stages 47–50 must attach hashed evidence through the controlled-result manifest. No repository test, mock callback or local browser run may change those stages to complete. If any legacy production record is discovered, the greenfield waiver is invalid and Stage 07 returns to pending until full production-size migration rehearsals pass.
