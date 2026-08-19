# Stage 8 — GEO, value reports and official plugins

## Completed locally

- Migration `0014_geo_reports_and_plugin_runtime.sql` adds append-only GEO publication evidence, field-difference tasks, plugin invocations/deletion receipts and immutable monthly report facts. All tenant data uses PostgreSQL RLS.
- GEO publication accepts only merchant-confirmed complete canonical facts, scans all public copy for forbidden inclusion/ranking/traffic promises, submits one authorized target at a time and preserves external reference, public URL, response evidence and `retry_after`.
- The worker checks due targets weekly. It separately checks authorization, link accessibility and hashes of name, address, phone and business hours; only differing targets become stale and receive repair tasks.
- Monthly reports are materialized idempotently from exact outbox event IDs and versioned metric definitions. Every returned metric contains its unit, definition, calculation version, event types, event IDs, source count and generation cutoff. GEO health is explicitly non-ranking.
- The official plugin directory returns only published first-party versions. Installation requires the responsible merchant owner to accept the exact manifest permission set. Plugin grants are validated against the installed manifest.
- Runtime calls enforce installation grants and HTTPS hostname allowlists before the gateway. Denials are committed as security evidence. Each installation has its own failure counter and circuit; three consecutive runtime failures open only that plugin circuit and do not stop order or customer-service APIs.
- Permission/domain expansion requires explicit reauthorization. Uninstall revokes all grants, increments token generation, invokes manifest deletion scopes and records an immutable deletion receipt.
- Three repository-owned pilot templates cover dining, local retail and leisure services without enabling later-phase public marketplace behavior.

## Frozen acceptance coverage

| Case    | Evidence                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| GEO-001 | `validateGeoProfile` returns exact missing field paths and migration keeps `INVALID` as a legal profile state.   |
| GEO-002 | Publication persists target status, external record, link, timestamps and append-only receipt.                   |
| GEO-003 | Target-level `retry_after`; publication and monitoring address one target and never reset successful siblings.   |
| GEO-004 | Policy test rejects promises of inclusion, first-place ranking, traffic and conversion.                          |
| PLG-001 | Manifest schema plus owner confirmation requires permissions, domains, fee and uninstall impact.                 |
| PLG-002 | Missing grant returns 403 and commits a `DENIED` invocation receipt.                                             |
| PLG-003 | Non-HTTPS or undeclared hostname is rejected before the runtime gateway.                                         |
| PLG-004 | New permission or domain changes require reauthorization; patch versions without expansion may roll forward.     |
| PLG-005 | Runtime timeout/unavailability increments an installation-local counter and opens the circuit at three failures. |
| PLG-006 | Uninstall revokes grants/token generation, stops future invocation and records manifest deletion scopes.         |

## Verification boundary

- Local unit and HTTP tests, TypeScript, OpenAPI, builds and static PostgreSQL contract checks pass.
- A real PostgreSQL 15 runtime is not installed on this workstation. CI is wired to execute clean-schema, incremental migration and database guard fixtures after the user-authorized final push.
- Real GEO/channel and plugin runtime credentials are not present. Their controlled pre-production adapter, timeout, accessibility and egress behavior must be exercised in Stage 10; local tests do not claim external-channel success.
