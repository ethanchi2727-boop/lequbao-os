# Greenfield cutover and legacy-data rollback boundary

The release is currently a greenfield replacement because the product owner has stated that V5 was never used in production and explicitly authorized a breaking rewrite. That statement does not by itself prove a safe launch. The controlled release must inventory every previously deployable SQLite/database location, deployment volume, object store and provider ledger and independently establish that there are zero production business records.

Store the redacted inventory as `legacy-production-inventory.json`, the independently reviewed decision as `greenfield-waiver.json`, the exact-candidate fresh installation as `fresh-install.log`, and the write-boundary drill as `rollback-window.log`. The waiver must identify the release commit, environments checked, data owners, query or inspection method, UTC time and zero counts by business domain. It must not contain credentials, personal values or raw object keys.

### Read-only V5 SQLite inventory

For every discovered SQLite store, create an execution-only JSON configuration outside the repository. It must bind the exact candidate SHA and list each source with a unique `id`, `kind: "sqlite"`, an absolute `path`, and a declared environment of `development`, `test`, `controlled-preproduction`, `production`, or `unknown`. Then run:

```powershell
pnpm v5:inventory -- --config=<absolute-config.json> --output=<absolute-evidence-root>\legacy-production-inventory.json
```

The tool opens each database read-only, hashes the physical location and bytes, and records only schema table names and row counts. It never emits record values or the source path and refuses to overwrite prior evidence. A non-empty `production` or `unknown` source returns `STOP_RELEASE`; development/test data remains `DATA_PRESENT_REVIEW_REQUIRED`. Even an empty result remains `INDEPENDENT_REVIEW_REQUIRED`: the tool proves only the explicitly listed files and cannot establish that every deployment volume, object store or provider ledger was found. The data owner and an independent reviewer must reconcile that coverage before creating `greenfield-waiver.json`.

The repository-local ignored V5 database must be inventoried if present; it must not be deleted merely to obtain an empty result. If it contains rows, retain its hash and determine from deployment ownership evidence whether it is development seed data or a formerly deployable store.

Before the first production business write, rollback may route traffic back to the unused V5 deployment or remove the new deployment. After the first production write, an application rollback is permitted only if the old version is proven compatible with those writes. Otherwise use a forward fix or restore the verified V6 backup; never overwrite V6 orders with an empty or older V5 database.

If any V5 production order, payment, refund, reward, verification, customer, consent, merchant, identity or provider record is found, the greenfield waiver is invalid. Stop release and restore the full migration path below: two production-size rehearsals, resumable cursor/hash evidence, tenant-day/tenant-total/global reconciliation and an old-code compatibility window.

## Legacy-data contingency

Code rollback is separate from data rollback. Migrations 0002–0015 are expand-only during the compatibility window; old readers remain on stable fields and no down migration deletes post-switch orders.

- Pause a failing backfill by expiring its cursor lease. Resume from the last committed source primary key and exact batch hash.
- An exact source replay must resolve to the same mapping and target hash. A changed source record becomes a new reviewed batch; it never silently replaces financial history.
- Do not enter Switch while any tenant/day, tenant-total or global-total reconciliation is unexplained.
- Roll back application traffic with feature flags, leave expanded columns/tables in place, and keep the old system read-only. Never restore a full pre-migration database over orders written after migration began.
- Contract cleanup is a later separately approved release after two rehearsals, backup restore verification and business/finance/security sign-off.
