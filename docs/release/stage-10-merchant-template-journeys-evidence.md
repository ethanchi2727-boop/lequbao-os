# Stage 10 merchant-template journey closure

Date: 2026-08-19

## Outcome

All 24 merchant-template leaves now use authenticated server state. The final closure added PAGE-269–270, PAGE-280, PAGE-282, PAGE-297–299, PAGE-302, PAGE-304–305 and PAGE-307 without weakening tenant, identity or financial boundaries.

## Security boundary

- Merchant cart and checkout require the tenant/customer/store-bound consumer bearer in `Authorization` and the platform account bearer in `X-Life-Authorization`.
- The API validates both live database sessions and an exact active platform-account-to-merchant-customer link.
- Tenant, customer, store and `MERCHANT_MINI_PROGRAM` order source are server-derived. Cart removal and checkout retrieval reject any aggregate containing an out-of-scope item or group.
- Quote and submit are idempotent. Price, inventory, fulfillment policy, discount and refund summary are re-read or snapshotted by the server.
- AI conversations disclose automation, stop AI replies after human handoff and use the existing object-store/message audit boundary. Profile consent withdrawal and privacy-copy requests use the durable privacy queue.
- Refund applications submit only the remaining refundable quantity; the service independently recalculates amount and approval requirements from the immutable order snapshot.
- Store switching lists only active stores in the signed merchant tenant, atomically revokes the old session, creates a deterministic idempotent target session and signs it with the original expiry. It cannot extend authentication lifetime.
- Merchant membership exposes only current customer status and the isolated CNY reward-account projection. Nickname/mobile ciphertext and payment balances never enter the response.

## Local verification

- Merchant journey and checkout service: 15 focused tests.
- HTTP dual-header route wiring: covered in the API shell suite.
- Merchant mini-program contract, JavaScript syntax and three journey policy tests pass.
- OpenAPI validates 115 implementation-bounded paths.
- PostgreSQL migration `0019` is included in both clean and incremental CI paths. Real PostgreSQL execution remains a controlled-environment requirement and is not represented as local evidence.
