# ADR 0002: Distribution payment and reversal ledger

## Status

Accepted for the V6.1 rebuild foundation.

## Decision

- A distribution action is requested, approved by a different active `PLATFORM_FINANCE` user, and then consumed by execution. The immutable request hash and expiry prevent approval reuse after the content changes or the approval becomes stale.
- The approver's active membership and finance role are checked again during approval and execution. Database constraints independently prohibit requester/approver identity equality.
- A successful payout requires one unique provider-reference hash for every positive frozen allocation. Provider evidence and the resulting distribution entry commit atomically.
- An `ACCRUAL` is positive. A `PAYMENT` is its exact negative and links the original accrual. A `REVERSAL` is the exact negative of the entry it reverses.
- Before payment, reversal links the original accrual. After payment, reversal links the payment, whose own link preserves the complete allocation-to-payment-to-reversal chain.
- Distribution entries and completed provider attempts are append-only. A paid statement is never rewritten to erase history; only its aggregate state advances while new entries preserve the financial facts.
- Minor-unit rounding residuals for the frozen subscription policy go only to the `LEQU_LIFE` allocation. They are never distributed by generic largest-remainder ordering.

## Consequences

- The target schema adds `revenue_distribution_action_approvals` and `revenue_payout_attempts`, growing from the verified 73-table source package to 76 audited target tables.
- Payment providers may retry safely through command idempotency and unique provider references. Failed-provider attempt orchestration remains a later connector concern; a successful result can never omit evidence.
- The current API foundation still lacks signed session-token authentication. Actor IDs are validated against active finance membership but are command inputs, so these endpoints are not production-exposable until the token-derived actor boundary is implemented.
