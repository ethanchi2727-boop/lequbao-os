# Financial-policy production approvals

This gate is required before real consumer money, production payout or any legacy reward balance is connected. Code, unit tests and provider sandbox success do not decide legal ownership or commercial responsibility.

## Required decisions

The business owner and finance owner must approve a redacted decision record covering:

- payment-account and service-provider ownership;
- payment fees, refunds, chargebacks, invoice and settlement responsibility;
- merchant identity and provider-account mapping;
- legacy balance funding, identity mapping, freeze time, reconciliation and rollback responsibility;
- the frozen subscription distributable-income policy (`70% / 10% / 20%`) and the unresolved channel-share conflict recorded as C-001;
- compute-package allocation (`50% / 30% / 20%` or `50% / 30% / 10% / 10%`) and the rule for an effective regional service provider;
- confirmation that new orders never use the historical `15% / 15% / 70%` company split and that historical facts retain their original snapshots;
- approvers, decision version, effective boundary, UTC approval time and conditions that force a new approval.

The record must be signed or approved in the organization's accountable system and independently reviewed. Store only internal identity references, approval receipt identifiers and document hashes; exclude bank credentials, raw provider identifiers, personal identity values and signatures containing secret material.

## Evidence result

Export the redacted decision as `payment-provider-sandbox/financial-policy-approvals.json`. It must bind the exact release commit and controlled deployment; identify different business-owner and finance-owner subjects with `APPROVED` receipt IDs and non-future UTC times; record a later approval from a third independent reviewer; and contain no unresolved item. Its structured decisions must explicitly resolve payment responsibility, merchant-account mapping, legacy balances, C-001 distribution, compute allocation and preservation of historical snapshots. Any absent owner, duplicated accountable subject, conditional decision without a satisfied condition, account mismatch, unresolved C-001 payout interpretation or legacy-balance uncertainty is a no-go.

This approval does not mutate financial history. A later policy change requires a new version for future transactions and cannot rewrite an order, ledger, right, statement, payout or reversal snapshot.
