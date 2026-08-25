# VISUAL-LIFE-05 evidence — cart and account primary tabs

## Delivered

- Cart: V6.3 green amount/item hero, stock/fulfilment/quote trust rail and official-sprite line items.
- Account: authenticated-state hero, server-derived order/entitlement/reward/address overview and dense service entrance grid.
- Service entrances use registered authoritative leaves: orders `PAGE-237`, aftercare `PAGE-239`, rewards `PAGE-252`, privacy `PAGE-254`.
- Existing quote, submit, payment, refund, address, invoice, entitlement and reward requests are unchanged.

## Verification

| Check                         | Result                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Life structure                | PASS — V6.3 five image tabs and 38 leaves                                      |
| Life tests                    | PASS — 6 files / 34 tests                                                      |
| H5 production build           | PASS                                                                           |
| WeChat production build       | PASS                                                                           |
| Production artifact policy    | PASS — Life Web 101 files / 4,784,262 bytes; manifest `bb42ff0a05004961`       |
| In-app browser                | NOT RUN — preceding local navigation remained blocked by browser client policy |
| WeChat DevTools / real device | NOT RUN                                                                        |

## Next stage

Continue page-level V6.3 migration on the highest-traffic registered leaves, beginning with category, product detail and order list, while preserving their existing service contracts.
