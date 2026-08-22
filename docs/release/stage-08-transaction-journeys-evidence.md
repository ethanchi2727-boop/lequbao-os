# Stage 8 transaction journey evidence

Date: 2026-08-19

## Outcome

The payment-to-aftercare portion of both consumer mini-programs is locally connected to authenticated server truth. This stage does not claim a production launch: real PostgreSQL, WeChat payment/refund sandbox and official device evidence remain controlled-environment gates.

## Authoritative consumer leaves

- 乐趣生活 PAGE-239, PAGE-240 and PAGE-246 query persisted refund, item-allocation, approval and provider-progress records.
- PAGE-245 submits only requested item quantities and reason text; the server derives refund money from original paid allocations.
- PAGE-242 and PAGE-243 expose only server-signed verification credentials reachable through an active platform-account merchant link.
- PAGE-252 merges reward grants across active links and shows granted, redeemed, reversed and available amounts from the immutable ledger projection.
- Merchant-template PAGE-284, PAGE-285, PAGE-288–291, PAGE-293 and PAGE-294 use the independent tenant/customer/store-bound consumer session for order, payment, refund and verification reads.

## Security boundaries

- Platform refund and verification routes do not accept a tenant, customer or store selection from the client. They resolve the owning order through active links and the underlying commerce service repeats the live session/account/link check.
- Merchant-template order lists are restricted to `MERCHANT_MINI_PROGRAM`, current tenant, current customer and current store.
- Payment success remains callback-owned. Both mini-programs query server order state after provider UI completion and never write a paid state from the client.
- Refund and voucher views display persisted states; generic routes remain fail closed outside explicitly labelled demo mode.

## Local verification

- API: 39 test files, 207 tests passed; TypeScript passed.
- Consumer mini-program: 3 tests passed; 38 frozen leaf contracts verified and built.
- Merchant mini-program: 3 tests passed; 24 frozen leaf contracts verified and built.
- OpenAPI: 106 implementation-bounded paths verified.
- Full workspace after the workbench command closure: 259 unique tests passed and all six production builds passed.
- Security gate: 375 text files and 249 SBOM components, no embedded production-secret pattern.

## Remaining work

Merchant-template PAGE-280 and PAGE-282 still need a persistent store-bound cart/checkout boundary. Fulfilment actions, customer service, remaining workbench writes and all controlled-environment launch gates are not completed by this stage.
