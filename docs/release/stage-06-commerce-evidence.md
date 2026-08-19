# Stage 6 commerce evidence — 2026-08-18

## Scope completed

- Server-priced orders and atomic inventory reservation, expiry release and paid consumption.
- Confirmed merchant-account payment creation, original-body callback verification and exact replay convergence.
- Explainable item-level refunds, snapshot approvals, provider attempts and refund-driven entitlement/reward reversal.
- Opaque store/time/risk-bound verification with database-final concurrency control.
- Balanced append-only reward ledger and linked reversals.
- Provider-evidenced daily payment/refund/order/reward/verification reconciliation with a one-cent stop.
- Production HTTP boundaries, worker dispatch, OpenAPI and clean/incremental PostgreSQL CI wiring.

## Frozen P0 coverage

| Group          | Cases       | Evidence                                                       |
| -------------- | ----------- | -------------------------------------------------------------- |
| Order          | ORD-001–003 | `commerce-order-service.test.ts`, inventory fixture            |
| Payment        | PAY-001–005 | `commerce-payment-service.test.ts`, callback receipt guards    |
| Refund         | REF-001–004 | refund/payment service tests, refund scope and approval guards |
| Verification   | VER-001–003 | verification service tests, wrong-store/expired/replay fixture |
| Reward         | REW-001–004 | callback tests, balanced/immutable/reversal database guards    |
| Reconciliation | REC-001–002 | reconciliation service tests and one-cent fixture              |

## Local gate

- Formatting and ESLint: passed.
- V6 contracts: 73 source tables, 111 audited target tables, 46 events, RLS and audit guards passed.
- RBAC: 15 roles, 51 permissions and generated grants passed.
- Release map: all 143 frozen acceptance cases and all 307 page nodes/197 leaves accounted for.
- OpenAPI: 68 implemented paths passed syntax, reference, uniqueness and security checks.
- TypeScript: all workspaces passed.
- Tests: API 141; Worker 8; Contracts 11; Web 8; total 168 passed.
- Production builds: contracts, API, Worker and Web passed.

## Evidence boundary

The PostgreSQL fixture is included in clean-schema and incremental migration CI, but it was not executed locally because this workstation has no PostgreSQL runtime. Real payment/refund callbacks, daily bills and credentials are not claimed as verified until controlled sandbox and pre-production stages. No commit or push was made.
