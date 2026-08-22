# Production dependency security policy

Production dependency changes have three independent fail-closed checks:

1. `pnpm-lock.yaml` must remain integrity-bound, use approved sources and install with `--frozen-lockfile`; only the reviewed `esbuild` lifecycle script may execute.
2. `pnpm audit --prod --audit-level high` must report no high or critical known vulnerability. CI executes this against the exact candidate lockfile. A registry outage is a failed check, not a clean result.
3. `pnpm licenses:check` inventories the installed production dependency graph and permits only the reviewed SPDX identifiers `0BSD`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `BlueOak-1.0.0`, `ISC` and `MIT`. Unknown, unlicensed, source-available and copyleft groups fail before release.

The license allowlist is a technical release policy, not a substitute for legal advice. Adding another license requires an explicit security/legal review and a tested policy change; a dependency must not be relabelled or omitted to make the gate pass. The checker rejects empty or malformed inventories and one package version appearing under contradictory licenses.

On 2026-08-20 the installed production graph contains 65 package versions across `BSD-3-Clause`, `ISC` and `MIT`, and the live registry audit reports no known vulnerability. These are point-in-time results; every candidate must rerun both commands.
