# LIFE-SUPPORT-15 evidence

Date: 2026-08-25

## Scope

- Affected users: authenticated 乐趣生活 consumers inside an already verified merchant/store context.
- Affected pages: PAGE-258, PAGE-262 and PAGE-264 in the shared H5/WeChat source.
- Existing APIs only: scoped conversation list/detail, message list/content/send and request-human action.
- Existing persistence only: message object storage, `conversation_messages`, `conversations`, `conversation_ai_jobs`, `handoff_tickets`, idempotency, audit and Outbox behavior implemented by the customer-service service.
- No schema, policy, money, order, payment, reward or settlement change.

## Product and security behavior

- The UI opens only conversations returned for the current merchant consumer and store.
- Message metadata is loaded in persistence order. Full content is fetched only through the ownership-revalidating content endpoint; object references are not used by the UI.
- Customer text is sent with a unique idempotency key and is considered successful only after the service returns the object-first persisted message.
- Human takeover is offered only for `BOT_ACTIVE`; the durable response is displayed even if the follow-up list refresh fails.
- PAGE-264 filters the same server conversation list to records carrying a handoff ticket. It does not create a second client-side ticket model.
- New conversation creation remains unavailable because this stage has no authority to invent service-consent policy evidence.

## Verification

- Full Life suite passed: 7 files / 43 tests, including source-level message, ownership-content and request-human bindings.
- 乐趣生活 H5 production build passed.
- 乐趣生活 `mp-weixin` production build passed.
- Full root gate passed 963 tests, all formatting, lint, contract, type, security, operations and deployment checks, and all production builds.
- The artifact gate reported 99 Life H5 files / 4,810,851 bytes and manifest `ec9a8c4c114d6877`.
- GitHub CI is recorded after it runs for the exact pushed stage commit.

## Rollout, rollback and reconciliation

- Roll out after LIFE-CONTEXT-13; without a valid merchant context the existing boundary remains closed and no customer-service request is sent.
- Roll back the UI while preserving all messages, tickets, events and idempotency rows already committed.
- Reconcile a controlled run by matching message object digest, `conversation_messages`, conversation version, AI job or handoff ticket, Outbox event and returned identifiers.
- Local source tests/builds do not replace authenticated PostgreSQL, object-store, model, enterprise-WeCom notification, browser or real-device evidence; those remain unverified here.
