# VISUAL-LIFE-02 evidence — V6.3 runtime top and theme contract

## Scope

This stage connects the official 乐趣生活 V6.3 WeChat-top contract to the five primary UniApp pages. Existing product routes, APIs, database schema, persistence, money, permissions, audit, and historical behavior are unchanged.

## Implementation

- `life-visual.js` owns the three official green/coral/blue banner ramps and converts WeChat window/menu-button runtime values into status, navigation, and capsule-reservation dimensions.
- `LifeTopBar.vue` places city and search in one top operation row. It reserves the real WeChat capsule rectangle only in the `MP-WEIXIN` build and does not draw a fake capsule on H5.
- `LifeSurface.vue` applies the shared theme and top bar to primary pages while leaf pages keep their existing business surfaces.
- 首页/商城/生活圈 bind green/coral/blue respectively; 购物车/我的 bind green.
- Desktop-width H5 renders the Life surface and native tab bar in a centered 480px mobile canvas instead of stretching the mini-program layout.

## Local verification

| Check                        | Result                                              |
| ---------------------------- | --------------------------------------------------- |
| Life structure gate          | PASS                                                |
| Life Vitest                  | PASS — 5 files, 26 tests                            |
| H5 production build          | PASS                                                |
| `mp-weixin` production build | PASS                                                |
| 390×844 H5 overflow          | PASS — document width 375px, no horizontal overflow |
| 首页 theme tokens            | PASS — `#078e64 / #22c98f / #e6faef`                |
| 商城 theme tokens            | PASS — `#ef3b43 / #ff756c / #fff0e9`                |
| 生活圈 theme tokens          | PASS — `#0878b6 / #27c4df / #e7f9ff`                |
| Search interaction           | PASS — navigated to `/pages/page-203/index`         |
| 1024×768 H5 response         | PASS — page and tab bar both centered at 480px      |

The local server returned the H5 entry, chunks, official tab icons, and page assets successfully. A missing optional root favicon was ignored because it does not affect the product runtime.

## Evidence boundary

Browser checks prove the compiled H5 behavior only. They do not prove WeChat DevTools, real-device capsule placement, device safe-area variants, production identity/provider configuration, or controlled deployment approval.

## Next stage

Migrate the 首页 information architecture to the official high-density retail composition and import the three official retail image assets while continuing to bind products, stores, inventory, cart writes, and prices to existing server data.
