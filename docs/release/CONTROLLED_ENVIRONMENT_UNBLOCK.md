# Controlled-environment unblock checklist

## Current finding — 2026-08-19

The GitHub repository has no Actions secrets, Actions variables, environments or deployments. The local workstation has no Docker-compatible engine or installed WSL distribution. Therefore no real identity, object, WeCom, WeChat, payment, GEO/plugin, cross-fault-domain restore, production-shaped load or on-call result can currently be produced without fabricating evidence.

This is an infrastructure/account boundary, not an untracked product-code gap. The repository now provides a fail-closed preflight:

```powershell
node tooling/controlled-environment-preflight.mjs
node tooling/controlled-environment-preflight.mjs --stage=47
```

It prints only setting names and validation reasons. It never returns secret values. A zero exit code means configuration is structurally ready to start controlled execution; it does not mean a suite passed.

## Stage 47 — identity, object and enterprise WeCom

Provision a non-loopback PostgreSQL database, secret-manager values, object/OCR/speech gateway, enterprise-WeCom configuration/member gateway, notification gateway and privacy export/deletion gateways. Register the real enterprise callback and exercise one-time `ENTERPRISE_WECOM` and `PHONE_OTP` assertions through `POST /api/v1/auth/sessions/exchange`.

The application rejects client-supplied tenant/user/MFA facts. The trusted identity gateway must consume the assertion once, enforce device/account/source-IP/tenant rate limits and return canonical tenant, user, MFA, device hash, allow decision, policy version and short freshness/expiry evidence. Configure `TRUSTED_PROXY_CIDRS` to only the controlled ingress ranges, then prove forwarded addresses cannot be spoofed. Verify successful login and tenant switch produce immutable audit rows containing keyed hashes rather than raw assertions, IPs or user agents. Missing gateway or trusted-proxy configuration prevents production API startup.

## Stage 48 — WeChat release and payment

Provision a WeChat component-platform test merchant/AppID plus builder, callback and commerce-provider gateways. Execute experience build, review, publish, staged rollout, authorization loss and rollback. Execute payment creation, verified raw callback, duplicate callback, provider-unknown query-before-retry, partial/full refund and merchant-account reconciliation.

Do not store authorization codes, merchant keys, callback secrets or raw payment customer data in evidence. Required files and exact pass criteria are owned by `controlled-acceptance-plan.json`.

## Stage 49 — production-shaped staging and pilot

Deploy the exact candidate commit behind HTTPS with separate least-privilege identities. Configure Outbox, GEO/plugin egress isolation, customer-service knowledge/model/tool gateways and the performance scenarios. Deliver P0 alerts to the real on-call channel and retain acknowledgement evidence. Run the staged internal/pilot/canary release with rollback available.

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
