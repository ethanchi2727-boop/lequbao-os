# LIFE-SECURITY-18 evidence

Date: 2026-08-25

## Scope

- Affected users: merchant consumers and authorized employees reading or sending customer-service message metadata.
- Affected API schema: `CustomerServiceMessage` responses from list/send endpoints.
- No database migration or object-key persistence change; `conversation_messages.content_object_key` remains the durable server-side reference.
- No money, order, payment, reward, ticket, consent or retention behavior changes.

## Security behavior

- Normal message metadata no longer selects or returns `content_object_key` as `contentObjectRef`.
- Consumers obtain full content only from the endpoint that revalidates tenant, customer, store, conversation and message ownership.
- Employees obtain full content only from the permission/store-scoped endpoint that also writes a content-read audit.
- Idempotency responses created before rollout may contain the old field internally; Zod response parsing strips it before returning.
- Repository search found no first-party frontend dependency on `contentObjectRef`.

## Verification

- Targeted customer-service API test passed: 16 tests, including an explicit assertion that sent message metadata has no `contentObjectRef`.
- API TypeScript checks passed.
- OpenAPI validation passed with 202 implemented paths.
- Full root gate passed 963 tests, all formatting, lint, contract, type, security, operations and deployment checks, and every production build.
- Production artifacts passed with manifest `3998da3dab4fb399`; the API bundle is 69 files / 1,123,768 bytes and Life H5 remains 99 files / 4,810,851 bytes.
- Exact-commit GitHub CI is recorded after the stage commit is pushed.

## Rollout, rollback and reconciliation

- Deploy API and clients together. Current first-party clients use redacted preview plus the protected content endpoint and require no compatibility bridge.
- External clients that improperly relied on the internal reference must migrate to the documented content endpoint; the key was never a public download URL.
- Roll back the response projection only if required, without changing stored object keys or message rows.
- Reconcile by proving list/send responses omit object keys while authorized content reads still return digest-verified content and employee reads remain audited.
