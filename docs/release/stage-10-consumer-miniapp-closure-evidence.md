# Stage 10 consumer mini-program closure

Date: 2026-08-19

## Outcome

All 38 乐趣生活 and all 24 independent merchant mini-program leaf pages now use authenticated server state. Production routes contain no static commerce fallback; explicit demo mode remains labelled and separate.

## Final 乐趣生活 boundaries

- Category, search, activity, product/specification and merchant pages use store-bound live catalog APIs.
- City, nearby and map pages traverse only active merchant links from the platform account. Optional coordinates are used in memory for one distance-sorted response and are not persisted.
- Membership and rewards read isolated immutable ledger projections and never conflate rewards with payment balances.
- AI/customer-service pages persist object-store-backed messages, support explicit human handoff and list only the current customer's current-store conversations.
- Privacy and subscription-message actions use versioned consent evidence and the durable privacy queue.
- Product provenance returns only a current `VERIFIED` report with version, evidence, verification time and expiry.
- Invoice title, tax identifier and email are protected by account-scoped forced RLS and AES-256-GCM; the API remains unavailable when the secret-manager key is absent.

## Local verification

- Migration `0020` is included in clean and incremental CI paths; the audited target is 139 tables across twenty migrations.
- OpenAPI validates 140 implementation-bounded paths.
- Focused API service, HTTP shell and mini-program contract checks pass. The final all-repository gate passes 299 tests, all TypeScript checks and all six production builds.
- Real PostgreSQL execution of migrations `0019`–`0020`, official WeChat builds, real-device location behavior and provider sandboxes remain controlled-environment requirements.
