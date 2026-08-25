# V6.1 decisions and conflicts

## Precedence

1. Repository `V6_1_BASELINE.md` copied from the latest external unique baseline for product, business, API, data, permission, money, and audit behavior.
2. Official visual amendments accepted by ADR-0013 for frontend labels, layout, theme, components, and assets only.
3. V6.1 package directories `00` through `07`.
4. Written and approved decision records created after the package.
5. Historical package directories `80` through `82`.
6. V5 repository documents, code, UI, and chat history.

## Decisions effective now

| Topic | Effective decision |
| --- | --- |
| Repository | Rebuild in this repository on an isolated branch; preserve `main` as rollback. |
| Product boundary | Only 乐趣宝 and 乐趣生活 are public products. |
| B-side topology | Former sales, merchant, provider, factory, GEO, and skill products become permissioned 乐趣宝 modules. |
| Consumer topology | 乐趣生活 owns the five frozen consumer entries and is not a mobile merchant console. |
| Data truth | PostgreSQL becomes the V6.1 source of truth; SQLite is migration input only. |
| Money | Integer minor units, immutable policy snapshots, balanced append-only ledgers, reversal entries instead of mutation. |
| Subscription income | Implement versioned 70/10/20 distributable-income policy. Production payout remains gated by written approval. |
| AI execution | Harness and models use Adapter, AI Gateway, and Tool Gateway; no direct business-table writes. |
| Delivery style | Modular monolith plus asynchronous worker first; split services only after measured need. |
| Legacy code | Reuse only when contract-compatible and covered by V6.1 tests. |
| Frontend topology | 乐趣生活由同一 Vue 3 UniApp 工程输出 H5 与微信小程序；乐趣宝以 PC Web 为核心，并由独立 UniApp 工程输出移动 H5 与微信小程序；商家独立小程序模板不等于乐趣宝小程序。 |
| Visual baseline | ADR-0013 adopts 乐趣生活 V6.3（微信顶部补丁版）and 乐趣宝 V6.2 as the only current UI baselines without changing V6.1 business behavior. |

## Conflicts requiring resolution

| ID | Conflict | Temporary ruling | Release impact |
| --- | --- | --- | --- |
| C-001 | 70/10/20 permanent subscription allocation versus a 25% channel-share ceiling | Treat 70/10/20 as the frozen merchant-origin revenue-right policy; do not infer that the 25% text overrides it | Blocks real payout |
| C-002 | 商务人员 versus 商务推广人员 | Use 商务人员 | Blocks final copy acceptance if inconsistent |
| C-003 | 生活消费 versus 生活 versus 首页 as first consumer tab | Resolved by ADR-0013: use 首页 from the official 乐趣生活 V6.3 visual baseline; the route and business identity remain unchanged | Resolved |
| C-004 | `开发主指令` versus `开发唯一主指令` | The unique instruction and external baseline take precedence | None after repository import |
| C-005 | npm/Vue/UniApp/SQLite versus pnpm/React/native/PostgreSQL recommendation | PostgreSQL and tenant architecture are mandatory; frontend and package-manager migration require an ADR and one active implementation | Blocks app scaffolding until ADR |
| C-006 | Delivered migration contains literal `+` patch markers | Repair generator and regenerate migration; never hand-edit only the generated output | Blocks database gate |
| C-007 | The 73-table package stores distribution totals but has no subscription receipt/refund source ledger | Add an immutable, provider-event-idempotent subscription cash ledger in migration 0004; locking must derive amounts from it | Blocks trustworthy statement locking without the repair |
| C-008 | 原页面树只列乐趣宝 PC/移动 H5，且乐趣生活 H5 与原生小程序实现分裂 | 以 ADR-0012 为增补基线：补乐趣宝微信小程序终端；乐趣生活收敛为 UniApp H5/微信双构建 | Blocks frontend launch until both products have exact terminal build evidence |

## Two signed financial gates

Before real consumer money or legacy reward balances are connected, written approval is required for payment-account ownership, service-provider mode, fee/refund responsibility, invoice and settlement subjects, legacy balance funding responsibility, identity mapping, freeze time, reconciliation, and rollback.
