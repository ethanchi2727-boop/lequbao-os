# VISUAL-LIFE-03 evidence — V6.3 high-density retail home

## Scope

This stage migrates the 乐趣生活 home composition and official retail imagery. It does not change product/store APIs, database schema, persistence, money, permissions, audit, order behavior, or historical records.

## Official assets

| Audit master          | Dimensions | SHA-256                                                            |
| --------------------- | ---------- | ------------------------------------------------------------------ |
| `category-sprite.png` | 1536×1024  | `2EF935F843FA6D786C8DAEBF112D4A1C845280EEBF55260E8E98C7C87D5EDDAD` |
| `product-sprite.png`  | 1774×887   | `C50EAC7BDAAEB01850E0822B9469781B61848F05134DD5F7A32D6F5E03A12291` |
| `summer-festival.png` | 1915×821   | `4AAC691FFC82A7629971EC1440EECE2C0DDB39AF79F43AADA264D7982E2816E3` |

Tests recompute these hashes so replacement or image drift fails closed.

Runtime assets are deterministic pixel-lossless WebP variants. Their hashes are `0B372A28…C56F2`, `E6B7052D…FA1BE`, and `6A6165C2…745F`; each remains below the 2 MiB single-file production limit. Moving runtime images out of `static` also prevents duplicate hashed/static copies.

## Product behavior

- The ambient top now contains the official event image and 15-category image grid.
- The body follows the official high-density rhythm: benefit strip, hot row, four life channels, trust row, nearby stores, and two-column goods shelf.
- Product titles, variants, stores, stock, prices, product detail IDs and cart writes remain sourced from existing `/api/v1/life/*` endpoints.
- Unsupported coupon amounts, fake countdowns, crossed-out prices, and promotional discounts are deliberately absent. Benefit copy states that checkout pricing and rewards follow server rules.
- Unauthenticated, loading, empty and recoverable-error states remain explicit.

## Local verification

| Check                        | Result                                                              |
| ---------------------------- | ------------------------------------------------------------------- |
| Life structure gate          | PASS                                                                |
| Life Vitest                  | PASS — 6 files, 33 tests                                            |
| H5 production build          | PASS                                                                |
| `mp-weixin` production build | PASS                                                                |
| H5 compiled sprite paths     | PASS — compile-time resolved, no unresolved-path warnings           |
| Production artifact policy   | PASS — no file over 2 MiB and Life Web below 8 MiB                  |
| 390×844 H5                   | PASS — 15 categories, no horizontal overflow                        |
| Category interaction         | PASS — first category opened `/pages/page-201/index?category=fresh` |
| Browser console              | PASS — no warning/error entries                                     |
| 1024×768 H5                  | PASS — page and tab bar centered at 480px                           |

The local server returned the entry, code chunks, tab icons, official category sprite and summer-event image successfully. The root favicon remains optional and absent.

## Evidence boundary

The browser used the truthful unauthenticated state because no real local consumer identity/API session was supplied. Authenticated product-shelf content, cart mutation, real WeChat DevTools/device rendering and controlled deployment remain unclaimed.

## Next stage

Migrate 商城 and 生活圈 to their official coral and glacier-blue high-density compositions using the same official assets and existing real discovery/cart endpoints.
