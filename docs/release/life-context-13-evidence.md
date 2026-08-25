# LIFE-CONTEXT-13 evidence

Date: 2026-08-25

## Scope

- Affected users: authenticated 乐趣生活 consumers who already have an active customer link to a merchant.
- Affected pages: PAGE-254, PAGE-255, PAGE-258, PAGE-262, PAGE-264 and the PAGE-259 order entry.
- API: `POST /api/v1/life/merchant-context/sessions` exchanges one valid platform-consumer session for one short merchant-consumer context.
- Existing tables only: `platform_consumer_sessions`, `platform_consumer_accounts`, `platform_consumer_tenant_links`, `stores` and `consumer_sessions`.
- No money, order, reward, settlement, historical record or frozen policy is changed. No new event is emitted because the exchange creates an expiring authentication context rather than a business fact.

## Security and permission behavior

- The server revalidates the live platform session and active account, the exact account-to-merchant customer link and the active merchant store inside one transaction.
- The merchant token uses the existing `lequbao-consumer` audience, is limited to one merchant/customer/store and expires after at most fifteen minutes without exceeding the platform session expiry.
- The client keeps the merchant context separate from the platform session and only sends it to the existing consumer, customer-profile and customer-service API families.
- The platform token is never forwarded to a merchant endpoint. Missing, inactive or unlinked merchant/store scope remains hidden behind authentication or not-found responses.
- Idempotent exchange uses a deterministic session identifier and rejects mismatched or expired replay instead of silently widening scope.

## Product behavior

- PAGE-259 can carry the authoritative order merchant/store identifiers into PAGE-262.
- PAGE-254 and PAGE-255 read the merchant-scoped customer profile only after a verified context exchange.
- PAGE-258, PAGE-262 and PAGE-264 read only that merchant/store's conversations and handoff tickets.
- Pages opened without a concrete merchant and store retain the previous safe boundary. Subscription writes remain unavailable until a live policy version and WeChat subscription result are supplied by authoritative services.
- H5 frozen-route deep links preserve only validated UUID values for `merchantTenantId`, `storeId` and `orderId`; credential-shaped or arbitrary query parameters are discarded.

## Verification

- API service and route tests: 42 passed across the targeted API files.
- Life session tests: 9 passed, including proof that the platform token is not sent downstream and that merchant paths are allowlisted.
- Full Life unit suite: 7 files / 43 tests passed.
- API type checks passed.
- OpenAPI validation passed with 202 implemented paths.
- 乐趣生活 H5 and `mp-weixin` production builds passed.
- The full root gate passed 962 tests, every type/static/security/deployment check and all production builds. The final artifact gate reported 99 Life H5 files / 4,802,642 bytes and manifest `5dda27b4227d8e58`.
- Real Chromium acceptance passed at `390x844` and `1024x768`: the no-context route remained safely closed, the validated context deep link reached the unauthenticated recovery state rather than exposing merchant data, no horizontal overflow occurred and browser logs were empty.

## Rollout, rollback and reconciliation

- Roll out the API endpoint before enabling merchant-context links in a deployed client. Existing boundary pages remain safe if the service is absent.
- Roll back by removing the client entry links and endpoint; issued contexts expire within fifteen minutes and do not alter business records.
- Reconcile controlled acceptance by matching account, merchant, customer and store identifiers to the authenticated PostgreSQL rows while checking that no platform bearer appears in merchant API request logs.
- Real PostgreSQL execution of this new exchange, live identity, WeChat policy/subscription interaction and device acceptance remain unverified in this local stage.
