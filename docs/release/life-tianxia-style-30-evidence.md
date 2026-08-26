# LIFE-STYLE-30 evidence — 分类、地图、会员与核销视觉迁移

## Scope

- Continue presentation-only migration for the formal Life V6.3 mobile consumer experience.
- Keep category, product, store, membership and verification state bound to existing server APIs.
- Do not manufacture store coordinates, membership benefits, verification success or authenticated data.

## Implemented

- PAGE-200: compact search capsule, four-column category entry and formal scene shortcuts.
- PAGE-207: image-backed mall banner, result-count search capsule and shared two-column product shelf.
- PAGE-219: map summary, compact store cards, coordinate-state copy and navigation action using only verified store-master coordinates.
- PAGE-235: formal member card, server-returned reward balance, reward batch count and explicit separated-ledger rules.
- PAGE-243: service-state verification summary, remaining-use hierarchy, validity copy and credential action.

## Verification

- Life targeted suite: 8 files / 57 tests passed.
- Life structure gate passed: V6.3 five image tabs and 38 independent leaves.
- Life H5 and `mp-weixin` production builds passed.
- In-app browser at 390×844 rendered PAGE-200/207/219/235/243 safe-close states. Each had a 375 CSS px document within the viewport, no horizontal overflow and no console warning/error.

## Honest boundary

- PAGE-219/235 authenticated normal data was not available in the browser session; the verified browser result covers safe authentication boundaries and layout containment.
- PAGE-243 rendered the truthful empty state because no order identifier or signed credential was supplied.
- No PostgreSQL mutation, official WeChat DevTools/device, provider or controlled-environment evidence is claimed.
- Per user instruction this stage is not committed or pushed.
