# Production dependency security policy

Production dependency changes have three independent fail-closed checks:

1. `pnpm-lock.yaml` must remain integrity-bound, use approved sources and install with `--frozen-lockfile`; only the reviewed `esbuild` lifecycle script may execute.
2. `pnpm audit --prod --audit-level high` must report no high or critical known vulnerability. CI executes this against the exact candidate lockfile. A registry outage is a failed check, not a clean result.
3. `pnpm licenses:check` inventories the installed production dependency graph and permits only the reviewed permissive identifiers in `production-license-policy.mjs`. The UniApp compiler adds `CC-BY-4.0` data, `CC0-1.0`, `(MIT AND Zlib)` and one legacy `Apache 2.0` metadata spelling; their exact packages and obligations are recorded in `UNIAPP_LICENSE_REVIEW.md`. Unknown, unlicensed, source-available and copyleft groups fail before release.

The license allowlist is a technical release policy, not a substitute for legal advice. Adding another license requires an explicit security/legal review and a tested policy change; a dependency must not be relabelled or omitted to make the gate pass. The checker rejects empty or malformed inventories and one package version appearing under contradictory licenses.

The frozen UniApp 5.07 compiler train currently pins vulnerable-compatible transitive ranges. The workspace therefore forces the smallest reviewed patched releases for `@intlify/core-base`, `@intlify/message-resolver`, `adm-zip`, `jpeg-js`, `postcss` and `ws`. These exact overrides are lockfile-bound, covered by both H5 and WeChat builds, and must be removed once the compiler train itself ships patched minimums. Broad major-version overrides are not allowed.

On 2026-08-23 the live production audit reports no high or critical vulnerability after applying those reviewed overrides. Remaining lower-severity findings do not bypass the candidate audit; they stay visible for follow-up. These are point-in-time results, so every candidate must rerun the audit and license checks.
