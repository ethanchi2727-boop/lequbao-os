# LIFE-CONVERSATION-22 evidence

Date: 2026-08-25

## Scope

- Affected users: authenticated 乐趣生活 consumers with an existing merchant/store customer-service history.
- Affected pages: PAGE-258, PAGE-262 and PAGE-264 in shared H5/WeChat source.
- Existing read APIs only: scoped conversation list/detail and message endpoints from LIFE-SUPPORT-15.
- No API, database, event, permission, money, order, payment, reward, consent or retention change.

## Product and security behavior

- Existing conversations can be filtered by assistant, handoff, human, waiting-customer and closed status without refetching or widening server scope.
- Raw state codes are paired with consumer-facing Chinese labels; conversation update time and ticket due time remain exact server facts.
- Empty merchant history, empty ticket list and empty filter results have separate truthful presentations.
- Frozen public links accept `conversationId` only for PAGE-258/262/264, only as a canonical UUID and never with credential-shaped query values.
- A requested conversation is opened only if it exists in the current merchant/store list returned after authentication; arbitrary IDs are not fetched from a deep link.
- A proposed historical-consent reuse path was rejected before commit because historical policy evidence does not prove the version is currently published.

## Verification

- Full Life suite passed: 7 files / 43 tests, including route allowlisting and support-source contracts.
- 乐趣生活 H5 production build passed.
- 乐趣生活 `mp-weixin` production build passed.
- Full root `pnpm check` passed: formatting, lint, frozen V6 contracts, RBAC, release/readiness/acceptance maps, security, operations, deployment, types, 963 tests and all production builds.
- Production artifact policy passed: Life Web 99 files / 4,812,977 bytes; complete artifact manifest `8eee0bd10886d744`.
- Exact-commit GitHub CI is recorded after the commit is pushed and the remote run completes.

## Rollout, rollback and reconciliation

- This is an additive client experience change over existing scoped APIs and can roll out with the current API candidate.
- Roll back the client filters/deep-link selection without altering conversations, messages, tickets or consent history.
- Reconcile a controlled deep link by matching merchant, store and conversation IDs to the server list and proving no request occurs for an ID absent from that list.
- Authenticated normal data, object-store messages, notification delivery, browser and real-device behavior remain controlled acceptance work.
