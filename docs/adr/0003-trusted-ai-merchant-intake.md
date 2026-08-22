# ADR 0003: Trusted AI merchant intake boundary

## Status

Accepted for the V6.1 rebuild foundation.

## Decision

- Merchant-intake HTTP commands derive tenant, actor, roles and session from an HS256-signed Bearer token. Request bodies cannot choose those identities. The service also rechecks active membership and role assignment so revoked access is not revived by an older token.
- Binary material lives in tenant-scoped object storage. The implemented API records the immutable object key and SHA-256; it does not pretend that JSON metadata is the binary upload itself.
- A field candidate must link one source asset in the same tenant and session. PostgreSQL only accepts candidates after that asset is marked `SAFE` and `SUCCEEDED`.
- AI candidates are non-authoritative. Different values for the same field remain as separate `CONFLICT` records; neither overwrites the other.
- Legal subject, payment, price, refund, public contact and publish-impact decisions require separately typed confirmation evidence. Confirmation rows and the final commit snapshot are append-only.
- Formal merchant creation is a service transaction that requires a current optimistic version, no unresolved candidates, legal-subject confirmation and any applicable high-risk confirmations. Merchant profile, commit snapshot, audit and `merchant.intake_committed.v1` Outbox event commit together.
- Model/scanner workers call the intake application service. They do not write candidate or merchant tables directly.

## Consequences

- Migration `0006` adds `merchant_intake_commits` and database guards, growing the audited target from 76 to 77 tables while preserving the verified 73-table source package.
- The implementation-bounded API grows from 9 to 14 paths.
- The current integration fixture proves safe extraction, rejected-file blocking, conflict retention, explicit confirmation, formal commit and idempotent replay against PostgreSQL 15.
- Object upload, malware scanner, OCR, speech transcription, model extraction, WeCom callback verification and UI/browser acceptance remain external integration work and must not be reported as complete.

## Rollback and history

- The whole slice can be rolled back to commit `794a580`; migration `0006` is additive and does not rewrite source-package history.
- Once real intake confirmation or commit records exist, rollback must preserve them as audit evidence. Do not drop or mutate them merely to revert application code.
