# VISUAL-LIFE-04 evidence — mall and community retail surfaces

## Scope

- Recompose `商城` with the official coral retail rhythm: hero, operational entrances, search, channel rail, continuous goods shelf and product detail sheet.
- Recompose `生活圈` with the official glacier-blue city-life rhythm: hero, scene grid, trust rail, nearby-store cards and a store-product sheet.
- Share one official-sprite product card between both pages.
- Preserve all authoritative discovery, store, stock, price and cart behavior.

## Business bindings

| Surface          | Authoritative operation                                             |
| ---------------- | ------------------------------------------------------------------- |
| Mall products    | `GET /api/v1/life/discovery/products?productType=PHYSICAL&limit=30` |
| Community stores | `GET /api/v1/life/discovery/stores?limit=30`                        |
| Store products   | `GET /api/v1/life/discovery/products?storeId=...&limit=30`          |
| Add to cart      | `PUT /api/v1/life/cart/items`                                       |

No discount, coupon amount, original price, countdown or delivery promise is synthesized. Price, inventory, store count and distance remain server-derived; missing location authorization is shown explicitly.

## Verification

| Check                         | Result                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| Life structure gate           | PASS — V6.3 five image tabs and 38 independent leaves                    |
| Life tests                    | PASS — 6 files / 34 tests                                                |
| Life H5 production build      | PASS                                                                     |
| Life WeChat production build  | PASS                                                                     |
| Visual asset gate             | PASS                                                                     |
| Frontend productization gate  | PASS                                                                     |
| Production artifact policy    | PASS — Life Web 101 files / 4,777,346 bytes; manifest `ec943365aa380330` |
| In-app browser render         | NOT VERIFIED — local navigation was blocked by `ERR_BLOCKED_BY_CLIENT`   |
| WeChat DevTools / real device | NOT RUN                                                                  |

## Next stage

Migrate 购物车 and 我的 to the same V6.3 shared density and state language, then repeat mobile/PC browser rendering when the local browser policy permits navigation.
