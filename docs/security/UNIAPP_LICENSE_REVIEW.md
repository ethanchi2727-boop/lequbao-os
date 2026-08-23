# UniApp dependency license review

## Scope

ADR-0012 adds the pinned DCloud Vue 3 UniApp compiler graph. The normal permissive allowlist already covers Apache-2.0, MIT, BSD and ISC. Four newly reported groups were reviewed rather than silently relabelled:

| Reported license | Package                     | Decision and obligation                                                                                                                        |
| ---------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `CC-BY-4.0`      | `caniuse-lite@1.0.30001809` | Browser-compatibility data; retain copyright/license/attribution in the third-party notice distributed with Web sources and release materials. |
| `CC0-1.0`        | `string-hash@1.1.3`         | Public-domain dedication; retain package identity in the SBOM.                                                                                 |
| `(MIT AND Zlib)` | `pako@1.0.11`               | Both permissive notices must remain available in the dependency notices/SBOM.                                                                  |
| `Apache 2.0`     | `qrcode-terminal@0.12.0`    | Upstream uses a non-SPDX metadata spelling for Apache 2.0; retain the Apache notice and do not rewrite installed metadata.                     |

This engineering review does not replace final legal/compliance approval. Adding another package under any of these groups still changes the lockfile and SBOM and must pass the same reviewed gate. Copyleft, source-available, unknown and unlicensed groups remain rejected.
