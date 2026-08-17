# V6.1 development rules

Before changing this repository, read these files in order:

1. `V6_1_BASELINE.md`
2. `PROJECT_STATE.md`
3. `docs/v6.1/DECISIONS_AND_CONFLICTS.md`
4. The relevant V6.1 product, page, data, API, permission, UI, and test contracts.

## Source of truth

- `V6_1_BASELINE.md` overrides old repository documents, old UI, historical code, and chat history.
- Current V6.1 material is `00` through `07`. Historical material `80` through `82` is read-only migration and reconciliation evidence.
- Do not redo a completed and verified V6.1 slice. Resume from `PROJECT_STATE.md`, Git status, recent commits, and the latest handoff.

## Frozen product rules

- Public products are only `乐趣宝` and `乐趣生活`.
- Use `商务人员`, `商务中心`, `商家经营中心`, `区域运营中心`, `小程序交付引擎`, and `GEO 服务` in new UI and contracts.
- 乐趣生活 top-level navigation is `生活消费`, `商城`, `生活圈`, `购物车`, `我的` until the baseline is formally amended.
- Subscription distributable income uses the versioned `70% / 10% / 20%` policy defined by the baseline.
- Subscription income, compute-package income, voucher rewards, consumer payments, refunds, and payouts must not share an undifferentiated balance.
- Historical orders and ledgers are immutable and always read their original policy snapshot.
- AI and Harness may prepare changes but cannot bypass confirmation for legal entity, payout account, price, refund rule, money, permissions, or production publication.

## Engineering rules

- V6.1 is a controlled rebuild. Existing V5 code is reusable only when it passes the V6.1 contract and tests.
- Use PostgreSQL 15+, tenant-scoped foreign keys, RLS, integer minor currency units, optimistic versions, idempotency, Outbox/Inbox, and immutable audit evidence.
- Frontends call APIs only. Models, Harness, plugins, and workers cannot write business tables directly.
- Every change documents affected users, pages, APIs, tables, events, permissions, history handling, tests, rollout, rollback, and reconciliation.
- Financial or migration conflicts stop production integration, not safe local contract and test development.
- Never weaken or delete tests to make a gate pass.

## Required verification

Run targeted tests first, then formatting/lint, type checks, full tests, production builds, OpenAPI/event/RBAC validation, database integration tests, browser acceptance, and relevant WeChat builds. Real PostgreSQL, RLS, concurrency, payment, WeCom, backup, and rollback evidence must be named explicitly; static checks are not substitutes.
