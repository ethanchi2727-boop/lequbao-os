# ADR-0013: Adopt the official V6 visual baselines

- Status: Accepted
- Date: 2026-08-25
- Scope: Frontend visual labels, layout, theme, shared components, and assets only

## Context

The 2026-08-25 official packages establish 乐趣生活 V6.3 and 乐趣宝 V6.2 as their unique current UI baselines. The 乐趣生活 WeChat-top package is a complete superseding package, not an additive fragment. Its safe-area, capsule, city/search, banner-theme, and five-tab contracts therefore replace the earlier V6.3 visual package as the implementation source.

V6.1 remains the controlled product and engineering baseline. The visual packages explicitly prohibit changing users, merchants, products, orders, payment, refund, ledger, settlement, permissions, audit, or historical snapshots as part of this visual upgrade.

## Decision

1. Adopt the patched 乐趣生活 V6.3 package as the only current 乐趣生活 UI baseline.
2. Adopt 乐趣宝 V6.2 as the only current 乐趣宝 PC and mobile UI baseline.
3. Amend the 乐趣生活 first tab label from `生活消费` to `首页`; its existing route and business identity remain unchanged.
4. Freeze the 乐趣宝 mobile tabs as `对话`, `工作`, `任务`, `消息`, `我的`. Existing routes remain in place while the visual pages are migrated incrementally so no working business API is disconnected.
5. Use official image assets for default and active tab states. Generated PNG files are deterministic 96 by 96 rasterizations of the supplied SVG masters and add no runtime dependency.
6. Keep product-specific theme namespaces and layouts separate. The two products may share business semantics but must not share page-level visual CSS.

## Precedence boundary

This ADR overrides V6.1 and earlier materials only where they conflict on frontend labels, layout, theme, components, or assets. `V6_1_BASELINE.md` remains authoritative for product topology, business rules, API contracts, database design, persistence, money, permissions, audit, security, and historical behavior.

## Package evidence

| Package                          | SHA-256                                                            | Role                                 |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| 乐趣生活 V6.3 正式视觉升级包     | `50A56618896914793351A46EA78AC3A68B76A28C10F160A9BC96E85CCDA255D6` | Superseded visual reference          |
| 乐趣生活 V6.3 微信小程序顶部补丁 | `08CF519F653760C7C87F1F114883F6CB5E81C82163036735A8AFDD55C70DE46F` | Authoritative 乐趣生活 visual source |
| 乐趣宝 V6.2 正式 UI 增量升级包   | `BA3F1DE5B42680C7A524F5EDA8517E04AAA45930F3B6E543B157CEFD2E85105A` | Authoritative 乐趣宝 visual source   |

## Rollout and rollback

Roll out by product and surface: baseline/assets, shared tokens/layout, then page families. Each slice must build for its intended H5 and WeChat targets and retain existing API contract tests. Rollback is limited to the affected frontend visual files and assets; it must not mutate data or reverse business events.

## Consequences

- Navigation labels and tab imagery now have repository-enforced contracts.
- 乐趣生活 runtime safe-area and theme-token work, and 乐趣宝 mobile/PC layout work, continue as separate reviewable stages.
- Passing static or local builds does not constitute real-device WeChat, production, database, payment-provider, or controlled release evidence.
