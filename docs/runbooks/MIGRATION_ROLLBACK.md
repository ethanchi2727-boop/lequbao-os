# Greenfield cutover and legacy-data rollback boundary

The release is currently a greenfield replacement because the product owner has stated that V5 was never used in production and explicitly authorized a breaking rewrite. That statement does not by itself prove a safe launch. The controlled release must inventory every previously deployable SQLite/database location, deployment volume, object store and provider ledger and independently establish that there are zero production business records.

Store the redacted inventory as `legacy-production-inventory.json`, the independently reviewed decision as `greenfield-waiver.json`, the exact-candidate fresh installation as `fresh-install.log`, and the write-boundary drill as `rollback-window.log`. The waiver must identify the release commit, environments checked, data owners, query or inspection method, UTC time and zero counts by business domain. It must not contain credentials, personal values or raw object keys.

Before the first production business write, rollback may route traffic back to the unused V5 deployment or remove the new deployment. After the first production write, an application rollback is permitted only if the old version is proven compatible with those writes. Otherwise use a forward fix or restore the verified V6 backup; never overwrite V6 orders with an empty or older V5 database.

If any V5 production order, payment, refund, reward, verification, customer, consent, merchant, identity or provider record is found, the greenfield waiver is invalid. Stop release and restore the full migration path below: two production-size rehearsals, resumable cursor/hash evidence, tenant-day/tenant-total/global reconciliation and an old-code compatibility window.

## Legacy-data contingency

Code rollback is separate from data rollback. Migrations 0002–0015 are expand-only during the compatibility window; old readers remain on stable fields and no down migration deletes post-switch orders.

- Pause a failing backfill by expiring its cursor lease. Resume from the last committed source primary key and exact batch hash.
- An exact source replay must resolve to the same mapping and target hash. A changed source record becomes a new reviewed batch; it never silently replaces financial history.
- Do not enter Switch while any tenant/day, tenant-total or global-total reconciliation is unexplained.
- Roll back application traffic with feature flags, leave expanded columns/tables in place, and keep the old system read-only. Never restore a full pre-migration database over orders written after migration began.
- Contract cleanup is a later separately approved release after two rehearsals, backup restore verification and business/finance/security sign-off.
