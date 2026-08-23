# Controlled acceptance execution

This runbook coordinates the release evidence that cannot be created on a developer workstation. It does not convert a pending case into a pass. Every execution must use the exact release-candidate commit, a named controlled environment, UTC timestamps and redacted artifacts under the suite directory declared in `docs/release/controlled-acceptance-plan.json`.

For each suite, record the commit, deployment identifier, environment owner, executor, start/end time, command or action log, immutable artifact hashes and final PASS/FAIL decision. Retain failed attempts; never replace them with an easier run. No token, database URL, provider signature secret, personal contact value, raw object key or customer content may enter the evidence package.

## Evidence manifest and launch verification

From a clean checkout of the exact candidate, create a new evidence workspace before any suite runs:

`pnpm controlled:prepare -- --release-commit=<40-character-candidate-sha> --deployment-id=<opaque-deployment-id> --environment=<controlled-environment> --evidence-root=<new-absolute-directory>`

The initializer refuses a dirty or different checkout and an existing destination. It binds the plan hash, candidate, deployment and environment; creates all 11 suite directories; and generates a complete 47-artifact checklist plus a `PENDING` decision template. The execution context has an exact field schema, canonical UTC creation time and plan-derived suite/artifact counts; undeclared fields, count drift or a context created after the result fail final verification. It deliberately creates no required artifact and no PASS decision. Keep every failed run in that workspace, and start a new workspace rather than overwriting evidence after a candidate change.

Write each real provider/tool response to a new temporary file outside the evidence workspace, redact it there, and import it through the exact command generated in the workspace checklist. The generic form is `pnpm controlled:capture -- --evidence-root=<absolute-workspace> --suite=<suite-code> --artifact=<declared-file> --source=<absolute-source-file>`. Capture rechecks the clean candidate and plan binding, accepts only a declared suite/file pair, rejects invalid or commonly unredacted content, copies without overwrite, verifies the destination hash against the inspected source and exclusively writes a hidden receipt bound to the candidate, plan, deployment, environment and artifact bytes. The receipt timestamp must fall after workspace creation and no later than final result generation. The assembler and launch verifier both require that receipt and bind its hash into results v3. Never redirect output directly over a declared evidence slot.

Place `results.json` at the evidence root and each declared artifact under the exact suite directory/name from `controlled-acceptance-plan.json`. The result manifest uses version 3 and contains:

- the exact 40-character release-candidate `releaseCommit`;
- `planSha256`, calculated from the unmodified bytes of `controlled-acceptance-plan.json`;
- a canonical millisecond UTC `generatedAt` (`YYYY-MM-DDTHH:mm:ss.sssZ`);
- one result for every suite, including external-only suites;
- suite code, exact environment gate, `PASS`, ordered execution/review timestamps, the planned executor role and a different independent reviewer role;
- different opaque executor, reviewer and embedded governance-approval subject IDs using an approved `github:`, `org:` or `workforce:` reference; approval receipt IDs must also be opaque references, and names, email addresses or personal contact values are forbidden;
- every declared evidence path, the SHA-256 of its actual file and the SHA-256 of its candidate/plan/deployment-bound capture receipt.

Extra suites, missing suites, missing/extra artifacts, path traversal, hash mismatch, same-person review, invalid opaque identities, review before execution completes, future timestamps, a changed plan or a different candidate commit all fail closed. Evidence paths are relative to `results.json`; do not use absolute paths or links.

The assembler and launch verifier also inspect the artifact bytes before accepting their hashes. Every declared artifact must be a regular non-empty UTF-8 text file between 16 characters and 100 MiB. JSON artifacts must parse to a non-empty object or array. Empty files, `{}`, `[]`, binary data, trivial verdicts such as `TODO`, `NOT RUN` or `PASS`, and common unredacted private-key, classic/fine-grained GitHub, npm, OpenAI, AWS, JWT, Bearer, provider-secret or credentialed URL forms fail closed. This is a minimum content and redaction boundary, not a substitute for suite-specific technical review.

All 39 JSON artifact names also have repository-owned minimum semantic contracts. The generated workspace checklist lists their required dotted fields, types, candidate/deployment bindings, numeric bounds, digest patterns, canonical millisecond UTC date-time rules and mandatory PASS/true/zero-unresolved invariants. Capture, assembly and final launch verification run the same contracts; a generic `{ "safe": true }`, a different candidate, an exceeded RPO/RTO, a mutable image tag, an ambiguous/future timestamp, a missing domain result, an empty proof collection or a wrong field type fails even when the file and receipt hashes match. The four governance-critical records receive deeper checks: financial approval requires separately accountable business/finance approvals plus later independent review and every frozen decision resolved; the V5 inventory rejects unknown or stop-release outcomes; the greenfield waiver requires zero-count inspection coverage for hosts, database paths, volumes, object stores, provider ledgers and ten business domains plus four distinct owner roles; legal release requires immutable HTTPS-published documents bound across all three product surfaces and distinct product/legal approvals. Disaster-recovery evidence also binds the encrypted artifact and financial snapshot hashes from backup through restore, requires the exact current SQL fixture set, privacy replay, cross-fault-domain WAL replay and deletion samples across object/search/vector/cache. Performance evidence must contain the actual three frozen scenarios, reconcile request outcomes, meet P95/error thresholds, retain unique persisted acknowledgement IDs, keep complete before/after 164-table database snapshots, introduce no dead Outbox event and carry a candidate/deployment-bound monitoring window that covers the run within frozen saturation limits. These schemas make evidence relevant to its declared slot but still do not replace independent technical review of the values.

The generated checklist also names suite-level cross-artifact invariants. Assembly and final launch verification reconcile commerce stock/order/ledger totals, payment merchant-account and amount references, backup/restore artifact identity, performance report/deployment/candidate image digests, official WeChat build/publish/rollback versions and delivered/acknowledged alert identifiers. Individually valid and correctly hashed files cannot form a PASS bundle when they contradict one another.

After independent review, set `CONTROLLED_RESULTS_FILE` to the absolute path of `results.json`, set `RELEASE_COMMIT` to the exact candidate commit and run `pnpm launch:gate`. A green result means the repository's 143 cases, 11 controlled suites, seven external gates, artifact bytes, plan and candidate commit match. It does not authorize deployment by itself; retain the output with the release approval.

To avoid manual hash and path errors, place the complete reviewed suite decisions in a JSON file outside the repository and run `pnpm controlled:assemble -- --decisions=<absolute-decisions.json> --evidence-root=<absolute-evidence-root>`. The assembler does not create a PASS decision: it requires every reviewed decision first, accepts only artifacts with valid capture receipts, calculates and binds both hashes, refuses to overwrite `results.json`, and immediately re-runs the same final verifier. Preserve a failed assembly as evidence and use a new evidence directory after remediation.

The local launch command is a precheck, not the final independent approval boundary. After it passes, run `pnpm controlled:stage-release -- --evidence-root=<absolute-workspace> --output=<new-absolute-staging-directory>`. The command rechecks the exact clean candidate and complete result bundle, then copies only `results.json`, the bound execution context, the 47 declared artifacts and their 47 capture receipts. It refuses overwrite, path escape and links; workspace guides, decision templates and any undeclared file are excluded. Archive only the staging-directory contents as `controlled-evidence.tar.gz`, with `results.json` at the archive root.

Create a **draft** GitHub Release targeted at the exact candidate SHA, using tag `controlled-evidence-<candidate-sha>-<YYYYMMDDTHHMMSSZ>`, and attach exactly one asset named `controlled-evidence.tar.gz`. Keep the release draft and access-restricted; never publish the evidence package.

From trusted `main`, dispatch `.github/workflows/verify-controlled-release.yml` with that exact candidate and tag. The protected `controlled-preproduction` reviewer must inspect the suite reviewer identities, hashes and real provider/deployment evidence before approval. The workflow rechecks required candidate CI through the same trusted workflow/app/SHA/repository provenance boundary used by image publication; requires the draft Release to contain exactly one uploaded, size-limited asset with the canonical name and a valid GitHub SHA-256 digest; locks the immutable Release ID and Asset ID; downloads through that Asset ID instead of a mutable tag/name lookup; and requires the downloaded bytes to match the asset digest. It then rejects unsafe or non-canonical archive paths before extraction, including alternate strings that would resolve to the same target, as well as links, special entries and any missing or undeclared package file. Trusted verifier code runs against the candidate plan and emits an OIDC-backed attestation for `verified-controlled-release.json`. The attested result records the Release ID, Asset ID and archive SHA-256 in addition to the candidate/results/plan binding. Retain that attestation, workflow URL and result with the release approval.

## PostgreSQL RLS and financial invariants

Run the clean `database/schema.sql` path and the incremental baseline-to-`0027` path on separate PostgreSQL 15 databases. Execute every file under `database/tests` with stop-on-error, then run authenticated API probes for cross-tenant order reads and customer updates. Preserve database logs, redacted HTTP responses and audit identifiers. A 404/denial is insufficient if any foreign field, timing-sensitive existence signal or mutation leaks.

## Worker connection and event fault injection

Use two tenants and a pooled Worker connection. Alternate tenant jobs on reused connections, inject an event whose tenant disagrees with its trusted delivery context, and terminate the consumer after its business commit but before acknowledgement. Prove transaction-local tenant reset, mismatch rejection and exactly one Inbox/business result after replay.

## Intake object and OCR evidence

Upload a synthetic licence image through the real object-store and malware/OCR adapters. Prove encrypted original retention, immutable hash and OCR candidates with source region and confidence. Use synthetic entity data and redact signed URLs and object keys from the package.

## Inventory concurrency

Prepare a synthetic variant with a known sellable quantity and submit more simultaneous orders than stock. Preserve request schedule, committed orders and inventory ledger/balance snapshots. The committed quantity must not exceed stock; losers must leave no order, reservation or Outbox fragment.

## Payment provider sandbox

Use the provider sandbox and the merchant's confirmed sandbox account. Prove the request amount comes from server order state, merchant-account references are SHA-256 redacted and match, the callback signature passes, replay is rejected and exactly one business transition reaches `SUCCEEDED`. Reconciliation must report both account and amount matches with zero unexplained item. An unknown refund starts at `UNKNOWN`, performs a provider query with the same idempotency key before any retry and converges exactly once to a provider-confirmed terminal state. Store only redacted provider identifiers and hashes.

Before connecting real consumer money or any legacy reward balance, complete `FINANCIAL_POLICY_APPROVAL.md`. Attach its redacted, signed decision record as `financial-policy-approvals.json`; a sandbox success cannot replace unresolved payment-account ownership, fee/refund/invoice responsibility, legacy funding or payout-policy approval.

## Plugin network isolation

Deploy the isolated plugin runtime with its production egress policy. Exercise one exactly granted HTTPS hostname and one undeclared hostname; retain runtime/network denial and audit evidence. Submit one real GEO target and prove that durable results do not claim inclusion, ranking, traffic or conversion.

## WeChat build publish and rollback

Build both mini-program packages with the versioned official WeChat DevTools CLI and retain each package SHA-256. Execute consumer and merchant-template scenarios on both iOS and Android official clients using only hashed device references. The approved review version must equal the published version; publication must retain a receipt hash and a non-empty pilot scope between 1% and 100%. Signed callbacks must reject replay and apply exactly one business transition. The rollback drill must create a different safe release, verify authoritative server state and retain a receipt hash. Match every external version and timestamp to server evidence. Do not store AppSecret, payment keys, raw callback signatures or personal device accounts.

## Identity secrets privacy and on-call

Verify revoked sessions are rejected within sixty seconds, high-risk MFA cannot be downgraded and sampled sessions are short-lived and tenant-scoped. Secret-manager evidence must show hashed secret references, least-privilege reads, rotation and zero plaintext finding. Object samples must prove encryption, retention and deletion. Privacy export must remain encrypted, reach only the verified session within fifteen minutes, and deletion must produce verified receipts across database, object-store, search, vector and cache. Exercise the exact 14 codes and frozen P0/P1 severities from `ops/alerts.yaml`. Retain exactly one successful delivery per alert to a declared hashed primary/secondary on-call recipient, followed by exactly one acknowledgement from that same recipient; trigger, delivery and acknowledgement UTC times must be ordered, and SLA breaches remain empty. Evidence identifies people only by approved internal reference or role.

Complete `LEGAL_COMPLIANCE_RELEASE.md` and attach the approved publication record as `legal-document-release.json`. A consent API or a privacy settings page is not evidence that the actual user agreement, privacy policy and required compliance texts are approved, reachable and version-bound.

The greenfield cutover guard, backup/restore and performance suites follow `MIGRATION_ROLLBACK.md`, `BACKUP_RESTORE.md` and `PERFORMANCE_ACCEPTANCE.md`. The greenfield waiver is valid only while every formerly deployable V5 store is proven to contain zero production records; finding one record immediately restores the full legacy migration rehearsal requirement. The release owner runs `pnpm launch:gate` only after every required artifact and the reviewed result manifest are attached. Missing, stale, mismatched or unreviewed evidence is a failed launch gate.
