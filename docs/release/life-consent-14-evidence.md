# LIFE-CONSENT-14 evidence

Date: 2026-08-25

## Scope

- Affected users: authenticated 乐趣生活 consumers operating inside an already verified merchant/store context.
- Affected pages: PAGE-254 and PAGE-255 on shared H5 and WeChat UniApp source.
- Existing APIs: `GET /api/v1/customer-profile`, `POST /api/v1/customer-profile/consents` and `POST /api/v1/customer-profile/privacy-requests`.
- Existing tables only: `customer_consents`, `customer_privacy_requests`, `customer_profiles` and `customer_profile_facts`; no migration, money, order, payment, reward or settlement behavior changes.
- No new event is introduced. Existing consent/privacy service auditing, idempotency and queue behavior remains authoritative.

## Product and security behavior

- The profile response returns the latest immutable record for each of PROFILE_MEMORY, MARKETING, SUBSCRIPTION_MESSAGE and LOCATION, including status, exact policy version, purpose, occurrence and validity.
- PAGE-254 queues a durable VIEW request scoped to `PROFILE_FACTS` and may append a PROFILE_MEMORY withdrawal only when the server reports a current GRANTED record.
- PAGE-255 displays current subscription status and may append a withdrawal only when the server reports a current GRANTED record.
- Withdrawal reuses the exact server-returned policy version and purpose. The client supplies only the fresh UI evidence reference and idempotency key.
- The client cannot manufacture an initial subscription grant. A new grant stays closed until an authoritative published policy and official WeChat subscription result are available.
- Platform tokens remain isolated from merchant endpoints through the LIFE-CONTEXT-13 merchant session boundary.

## Verification

- Targeted customer-service API test: 16 passed, including latest-consent mapping.
- API TypeScript checks passed.
- Full Life suite: 7 files / 43 tests passed, including source-level endpoint and policy-version guards.
- 乐趣生活 H5 production build passed.
- 乐趣生活 `mp-weixin` production build passed.
- Full root gate passed 963 tests, every formatting, lint, contract, type, security, operations and deployment check, and all production builds.
- The artifact gate reported 99 Life H5 files / 4,805,346 bytes and manifest `9d7a3fe31294f81a`.
- GitHub CI is recorded only after it runs for the exact pushed commit.

## Rollout, rollback and reconciliation

- Roll out the API response before or with the client. Older clients ignore the additive `consents` field.
- Roll back the client actions without deleting consent or privacy history. Already appended withdrawals and requests are durable business records and must not be removed.
- Reconcile by matching consumer/merchant/store identity, the previous GRANTED row, the appended WITHDRAWN row, the privacy request and the idempotency record in PostgreSQL.
- Local tests do not replace authenticated PostgreSQL, official WeChat, device or independently reviewed controlled evidence; these remain unverified in this stage.
