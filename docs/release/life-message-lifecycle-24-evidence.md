# LIFE-MESSAGE-LIFECYCLE-24 evidence

Date: 2026-08-25

## Scope

- Affected users: authenticated 乐趣生活 consumers viewing existing PAGE-258/262/264 conversations.
- Affected source: the shared H5/WeChat service page and its source contract test.
- Existing merchant-scoped conversation and message APIs only.
- No API, database, event, permission, consent, provider, order, payment or retention change.

## Product and security behavior

- Previously decrypted message bodies are removed from reactive client state on page reload and before every conversation switch.
- The previous conversation selection and messages are cleared before detail requests, so a failed switch cannot leave old content beneath a failure notice.
- A message-body response is retained only if the same conversation remains selected when the asynchronous request completes.
- Concurrent conversation-detail requests use a monotonic sequence guard, so an older response cannot replace the user's latest selection.
- Merchant context, draft text and status filters are reset before each page reload so missing or changed route context cannot reuse stale client state.
- Server ownership checks, object-first message persistence and scoped merchant authentication remain unchanged.

## Verification

- Source contract coverage asserts the sensitive-state clear and late-response identity guard.
- Full Life suite passed: 7 files / 43 tests; H5 and `mp-weixin` production builds passed.
- Full root `pnpm check` passed: formatting, lint, frozen V6 contracts, RBAC, release/readiness/acceptance maps, security, operations, deployment, types, 963 tests and all production builds.
- Production artifact policy passed: Life Web 99 files / 4,813,277 bytes; complete artifact manifest `fe9a36d1f1222a56`.
- Exact-commit GitHub CI is recorded after the commit is pushed and the remote run completes.

## Rollout, rollback and reconciliation

- This is a client-only data-minimization change and can roll out with the current API candidate.
- Roll back the client lifecycle guards without changing persisted conversations, messages or tickets.
- In controlled acceptance, decrypt one message, switch to another conversation while a body request is pending, and confirm no prior or late body remains visible.
- Authenticated normal data, object-store delivery, browser timing and real-device behavior remain controlled acceptance work.
