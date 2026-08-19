# Controlled-environment unblock checklist

## Current finding — 2026-08-19

GitHub now has a `controlled-preproduction` environment that requires review, prevents self-review and accepts deployments only from the trusted `main` workflow ref. The default branch contains the standalone preflight through reviewed PR #2, and `main` requires the candidate code-quality, PostgreSQL and container checks. Ten application-owned signing/encryption values were generated directly into environment secrets; the immutable candidate and environment label are recorded as variables. No secret value was printed or committed.

Real infrastructure remains absent: the repository has only one collaborator, and no non-loopback database, ingress CIDRs, deployed application, identity/object/WeCom/WeChat/payment/privacy/GEO/AI gateway, production-shaped scenario credentials, cross-fault-domain restore target or on-call receiver is configured. A read-only GitHub environment-name audit on 2026-08-20 confirms coverage of Stage 47 `2/15`, Stage 48 `3/9`, Stage 49 `7/32` and Stage 50 `1/2`; no secret value was read. Stage 49 includes the existing release SHA but still lacks the Worker tenant UUID and both candidate-publisher and deployment-platform image snapshots. These external values and an independent reviewer cannot be fabricated.

This is an infrastructure/account boundary, not an untracked product-code gap. The repository now provides a fail-closed preflight:

```powershell
node tooling/controlled-environment-preflight.mjs
node tooling/controlled-environment-preflight.mjs --stage=47
```

It prints only setting names and validation reasons. It never returns secret values. A zero exit code means configuration is structurally ready to start controlled execution; it does not mean a suite passed. The preflight now matches the API/Worker production startup boundary for PostgreSQL TLS, minimum secret lengths, the 32-byte address key and Worker tenant UUID, and its protected workflow rejects a configured release SHA that differs from the requested candidate. Once all performance settings exist, the same production-shaped performance validator also checks the candidate manifest, three GHCR digests, deployed-image equality, safe API paths/request bodies and a JSON report path before any load is sent.

## Stage 47 — identity, object and enterprise WeCom

Provision a non-loopback PostgreSQL database, secret-manager values, object/OCR/speech gateway, enterprise-WeCom configuration/member gateway, notification gateway and privacy export/deletion gateways. Register the real enterprise callback and exercise one-time `ENTERPRISE_WECOM` and `PHONE_OTP` assertions through `POST /api/v1/auth/sessions/exchange`.

The application rejects client-supplied tenant/user/MFA facts. The trusted identity gateway must consume the assertion once, enforce device/account/source-IP/tenant rate limits and return canonical tenant, user, MFA, device hash, allow decision, policy version and short freshness/expiry evidence. Configure `TRUSTED_PROXY_CIDRS` to only the controlled ingress ranges, then prove forwarded addresses cannot be spoofed. Verify successful login and tenant switch produce immutable audit rows containing keyed hashes rather than raw assertions, IPs or user agents. Missing gateway or trusted-proxy configuration prevents production API startup.

## Stage 48 — WeChat release and payment

Provision a WeChat component-platform test merchant/AppID plus builder, callback and commerce-provider gateways. Execute experience build, review, publish, staged rollout, authorization loss and rollback. Execute payment creation, verified raw callback, duplicate callback, provider-unknown query-before-retry, partial/full refund and merchant-account reconciliation.

Do not store authorization codes, merchant keys, callback secrets or raw payment customer data in evidence. Required files and exact pass criteria are owned by `controlled-acceptance-plan.json`.

## Stage 49 — production-shaped staging and pilot

Deploy the exact candidate commit behind HTTPS with separate least-privilege identities. Configure the one-shot Worker with an active tenant UUID, Outbox, GEO/plugin egress isolation, customer-service knowledge/model/tool gateways and the performance scenarios. Deliver P0 alerts to the real on-call channel and retain acknowledgement evidence. Run the staged internal/pilot/canary release with rollback available.

For Stage 49, dispatch the protected preflight with `candidate_image_run_id` set to the successful trusted candidate-image publisher run. After the local performance contract passes, the workflow verifies that run completed successfully from the `main` publisher workflow, downloads the exact `candidate-images-<candidate>-<run>` artifact and compares its normalized manifest with `PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON`. A manually reconstructed digest JSON or an artifact from another run/candidate fails provenance verification.

Local loopback performance and logical restore reports prove the harness only. They cannot replace production-shaped load, physical/WAL or cross-fault-domain recovery evidence.

## Stage 50 — go/no-go

Place the independently reviewed eleven-suite evidence bundle outside the repository, bind it to the immutable 40-character candidate commit, and run:

```powershell
$env:RELEASE_COMMIT = '<immutable candidate SHA>'
$env:CONTROLLED_RESULTS_FILE = '<absolute path to results.json>'
node tooling/controlled-environment-preflight.mjs --stage=50
pnpm launch:gate
```

Release requires 29/29 controlled cases, all seven external gates and zero open stop-release condition. Any cross-tenant exposure, unauthorized high-risk mutation, duplicate financial result, unexplained reconciliation difference, unsafe AI action, callback replay, plugin escape, unaudited mutation or high-severity vulnerability is an automatic no-go.

The bundle must also include the signed financial-policy decision required by `FINANCIAL_POLICY_APPROVAL.md` and the approved, live, version-bound legal publication matrix required by `LEGAL_COMPLIANCE_RELEASE.md`. Provider sandbox success, consent storage and privacy APIs do not substitute for these approvals.
