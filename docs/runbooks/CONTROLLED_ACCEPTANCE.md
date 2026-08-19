# Controlled acceptance execution

This runbook coordinates the release evidence that cannot be created on a developer workstation. It does not convert a pending case into a pass. Every execution must use the exact release-candidate commit, a named controlled environment, UTC timestamps and redacted artifacts under the suite directory declared in `docs/release/controlled-acceptance-plan.json`.

For each suite, record the commit, deployment identifier, environment owner, executor, start/end time, command or action log, immutable artifact hashes and final PASS/FAIL decision. Retain failed attempts; never replace them with an easier run. No token, database URL, provider signature secret, personal contact value, raw object key or customer content may enter the evidence package.

## Evidence manifest and launch verification

Place `results.json` at the evidence root and each declared artifact under the exact suite directory/name from `controlled-acceptance-plan.json`. The result manifest uses version 2 and contains:

- the exact 40-character release-candidate `releaseCommit`;
- `planSha256`, calculated from the unmodified bytes of `controlled-acceptance-plan.json`;
- a UTC `generatedAt`;
- one result for every suite, including external-only suites;
- suite code, exact environment gate, `PASS`, ordered execution/review timestamps, the planned executor role and a different independent reviewer role;
- different opaque executor and reviewer subject IDs using an approved `github:`, `org:` or `workforce:` reference; do not use a name, email address or personal contact value;
- every declared evidence path and the SHA-256 of its actual file.

Extra suites, missing suites, missing/extra artifacts, path traversal, hash mismatch, same-person review, invalid opaque identities, review before execution completes, future timestamps, a changed plan or a different candidate commit all fail closed. Evidence paths are relative to `results.json`; do not use absolute paths or links.

After independent review, set `CONTROLLED_RESULTS_FILE` to the absolute path of `results.json`, set `RELEASE_COMMIT` to the exact candidate commit and run `pnpm launch:gate`. A green result means the repository's 143 cases, 11 controlled suites, seven external gates, artifact bytes, plan and candidate commit match. It does not authorize deployment by itself; retain the output with the release approval.

To avoid manual hash and path errors, place the complete v2 suite decisions in a JSON file outside the repository and run `pnpm controlled:assemble -- --decisions=<absolute-decisions.json> --evidence-root=<absolute-evidence-root>`. The assembler does not create a PASS decision: it requires every reviewed decision first, reads only the plan-declared artifacts, calculates their hashes, refuses to overwrite `results.json`, and immediately re-runs the same final verifier. Preserve a failed assembly as evidence and use a new evidence directory after remediation.

## PostgreSQL RLS and financial invariants

Run the clean `database/schema.sql` path and the incremental baseline-to-`0026` path on separate PostgreSQL 15 databases. Execute every file under `database/tests` with stop-on-error, then run authenticated API probes for cross-tenant order reads and customer updates. Preserve database logs, redacted HTTP responses and audit identifiers. A 404/denial is insufficient if any foreign field, timing-sensitive existence signal or mutation leaks.

## Worker connection and event fault injection

Use two tenants and a pooled Worker connection. Alternate tenant jobs on reused connections, inject an event whose tenant disagrees with its trusted delivery context, and terminate the consumer after its business commit but before acknowledgement. Prove transaction-local tenant reset, mismatch rejection and exactly one Inbox/business result after replay.

## Intake object and OCR evidence

Upload a synthetic licence image through the real object-store and malware/OCR adapters. Prove encrypted original retention, immutable hash and OCR candidates with source region and confidence. Use synthetic entity data and redact signed URLs and object keys from the package.

## Inventory concurrency

Prepare a synthetic variant with a known sellable quantity and submit more simultaneous orders than stock. Preserve request schedule, committed orders and inventory ledger/balance snapshots. The committed quantity must not exceed stock; losers must leave no order, reservation or Outbox fragment.

## Payment provider sandbox

Use the provider sandbox and the merchant's confirmed sandbox account. Prove the request amount comes from server order state, the merchant-account hash matches, signed callback replay converges once, and unknown payment/refund responses are queried before any retry. Store only redacted provider identifiers and hashes.

Before connecting real consumer money or any legacy reward balance, complete `FINANCIAL_POLICY_APPROVAL.md`. Attach its redacted, signed decision record as `financial-policy-approvals.json`; a sandbox success cannot replace unresolved payment-account ownership, fee/refund/invoice responsibility, legacy funding or payout-policy approval.

## Plugin network isolation

Deploy the isolated plugin runtime with its production egress policy. Exercise one exactly granted HTTPS hostname and one undeclared hostname; retain runtime/network denial and audit evidence. Submit one real GEO target and prove that durable results do not claim inclusion, ranking, traffic or conversion.

## WeChat build publish and rollback

Build both mini-program packages with official tooling, execute the real-device matrix, submit review, publish a bounded pilot, validate signed callbacks and perform a rollback drill that creates a new safe release. Match every external version and timestamp to server evidence. Do not store AppSecret, payment keys, raw callback signatures or personal device accounts.

## Identity secrets privacy and on-call

Verify production identity revocation, MFA and short-lived sessions; secret-manager access auditing; encrypted object retention/deletion; privacy export and deletion across database, object, search, vector and cache targets; and delivery of P0/P1 alerts to a real on-call recipient. Evidence identifies people only by approved internal reference or role and must include acknowledgement time and escalation outcome.

Complete `LEGAL_COMPLIANCE_RELEASE.md` and attach the approved publication record as `legal-document-release.json`. A consent API or a privacy settings page is not evidence that the actual user agreement, privacy policy and required compliance texts are approved, reachable and version-bound.

The greenfield cutover guard, backup/restore and performance suites follow `MIGRATION_ROLLBACK.md`, `BACKUP_RESTORE.md` and `PERFORMANCE_ACCEPTANCE.md`. The greenfield waiver is valid only while every formerly deployable V5 store is proven to contain zero production records; finding one record immediately restores the full legacy migration rehearsal requirement. The release owner runs `pnpm launch:gate` only after every required artifact and the reviewed result manifest are attached. Missing, stale, mismatched or unreviewed evidence is a failed launch gate.
