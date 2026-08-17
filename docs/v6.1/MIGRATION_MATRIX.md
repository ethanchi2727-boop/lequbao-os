# V5 to V6.1 migration matrix

## Application topology

| V5 application | V6.1 destination | Treatment |
| --- | --- | --- |
| `admin-web` | 乐趣宝 platform administration | Rewrite; extract verified dashboard and approval behavior only |
| `sales-miniapp` | 乐趣宝·商务中心 | Rewrite inside unified identity, tenant, and permission shell |
| `merchant-miniapp` | 乐趣宝·商家经营中心 | Rewrite; retain verified order/acceptance/refund behavior as contract tests |
| `provider-miniapp` | 乐趣宝·区域运营中心 | Rewrite as role-scoped workspace, not a public product |
| MiniApp Factory modules | 小程序交付引擎 | Rewrite as durable one-click-delivery workflow |
| GEO modules | GEO 服务 | Retain facts, attribution, and compliance behavior; replace product shell |
| Skill Network modules | Harness skills, plugins, and workflows | Split contracts and enforce tool/plugin authorization |
| `consumer-miniapp` and `mobile` | 乐趣生活 | Rewrite around the five frozen top-level entries; retain verified payment and fulfillment invariants |
| Existing `api` | V6.1 modular API and worker | Replace SQLite persistence; extract compatible domain rules behind new contracts |

## Domain treatment

| Domain | Keep | Rewrite | Migrate/reconcile |
| --- | --- | --- | --- |
| Identity and auth | Proven token parsing and authorization tests | Tenant context, session revocation, MFA, device risk | Users, memberships, historical actors |
| Merchant and store | Verified validation and merchant workflows | Legal-entity master, tenant/store composite keys, AI intake | Merchants, stores, contacts, evidence |
| Catalog and inventory | Verified catalog/slot invariants | Shared products, variants, inventory ledger | SPU/SKU, stock, reservations, snapshots |
| Orders and payment | E8J idempotency, late-success, refund and credential invariants | Unified order/payment/refund/verification aggregates | Orders, transactions, callbacks, refunds, credentials |
| Voucher and reward | Historical rules and immutable voucher evidence | Balanced reward ledger and versioned funding policies | Accounts, grants, usage, reversals, negative balances |
| Subscription revenue | Valid ownership evidence and audit concepts | Permanent revenue rights, costs, statements, allocations, payouts | Merchant origin, contracts, historical commissions |
| Delivery and mini programs | Verified project/release concepts | Durable steps, authorization, build/review/publish/rollback worker | Existing projects, releases, AppID evidence |
| GEO | Facts, observations, issue history | Tenant-scoped publication targets and health workflow | Identities, channel snapshots, scores |
| AI and customer service | Assistant context and explicit-confirmation rules | Harness adapter, knowledge, conversations, handoff queue, customer consent | Approved knowledge and consented summaries only |
| Audit and events | Append-only event intent | Unified envelope, Inbox/Outbox, immutable audit store | Preserve original actor, time, source and payload hash |

## Data migration rule

The delivered 73-table schema does not replace the current approximately 136 SQLite tables by name. Every source table requires one of: `DROP_AS_DEMO`, `ARCHIVE_ONLY`, `MAP_DIRECT`, `MAP_TRANSFORM`, `SPLIT`, or `MERGE`. Each money-bearing source also requires row count, currency total, refund total, beneficiary total, sample hash, and policy-version reconciliation.

## API compatibility rule

The delivered 37 V6.1 paths are a target core contract, not a replacement for the current 134 paths. Each current operation is classified as `RETAIN_COMPAT`, `ADAPT`, `REPLACE`, or `REMOVE`. Compatibility endpoints are removed only after all callers and migration jobs have switched.

## UI completion rule

The 197 leaf-page records define scope, not complete implementation detail. Before a page enters development, its generated route, generic components, actions, exact API operations, permission codes, business states, fixtures, visual reference, and executable acceptance cases must be resolved into a page implementation contract.
