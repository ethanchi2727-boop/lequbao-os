# LIFE-PREVIEW-16 evidence

Date: 2026-08-25

## Candidate

- Source commit: `845ddf8` (`build life persistent support flow`).
- Artifact: exact H5 output from the passing LIFE-SUPPORT-15 root gate.
- Life artifact inventory: 99 files / 4,810,851 bytes; manifest `ec9a8c4c114d6877`.
- Local origin: isolated static server at `127.0.0.1`; no API, identity or database substitution was enabled.

## PC acceptance

- Route: PAGE-254 privacy and authorization.
- Viewport: 1024x768.
- The product shell remained centered at 480px and the document scroll width did not exceed the viewport.
- The full platform-session versus merchant-session boundary rendered, including `安全关闭` and `不发送越权请求`.
- Browser logs were empty.

## Mobile acceptance

- Route: PAGE-262 customer service.
- Viewport: 390x844.
- The page rendered the frozen title, AI/employee identity boundary, safe-close panel and merchant-order entry action.
- Document/body widths remained below the viewport; no horizontal overflow was observed.
- Browser logs were empty.

## Evidence boundary

- PC and mobile screenshots were captured and emitted in the active review session.
- The tested pages correctly sent no merchant API request without a concrete merchant/store context.
- This local run does not claim authenticated profile data, message content/send, human-ticket mutation, PostgreSQL persistence, official WeChat behavior, provider callbacks or real-device acceptance.
- Controlled acceptance must bind the real identity, database rows, object digest, consent history, ticket/event evidence and deployed image digest to the exact candidate.
