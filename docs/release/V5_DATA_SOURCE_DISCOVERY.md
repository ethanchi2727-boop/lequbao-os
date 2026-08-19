# V5 data-source discovery — not a greenfield waiver

Date: 2026-08-19

Candidate inventory hardening commit: `e89fb91`

Status: **INDEPENDENT REVIEW REQUIRED**

This is a repository and workstation discovery checkpoint for the first controlled action. It is not `legacy-production-inventory.json`, not `greenfield-waiver.json`, and not Stage 47–50 PASS evidence.

## Observed sources

- The GitHub V5 baseline tree contains no committed `.sqlite`, `.sqlite3`, `.db`, dump, backup, deployment manifest or Docker Compose file. Its README explicitly describes SQLite as a local adapter and says runtime SQLite data is not committed.
- The current GitHub repository reported zero Deployment records and zero Release records on 2026-08-19. Container-package coverage could not be read with the current token scope and is therefore unverified, not zero.
- A recursive filename scan of the local project parent found one V5 database: the ignored default API SQLite file at `apps/api/data/lequ-life.sqlite`. No local `.env` was found.
- The file is 3,145,728 bytes with SHA-256 `a79c4b1ce1effd8b6022ec646e5d20bd78b85bc915525d140dca7f4c032bd19c`.
- The read-only inventory found 136 application tables, 123 non-empty tables and 1,520 rows. It did not read or emit record values.
- V5 source initializes that exact relative database path and, outside production unless explicitly disabled, calls development identity and domain demo seed functions. The inspected database has one `demo_runs` row, all user identifiers use the demo prefix, and its only tenant is the known demo tenant. Other seeded workflows create identifiers that do not necessarily contain the word `demo`, so those markers are supporting evidence only.

## Decision boundary

The local file is declared `development` for this discovery run because of its ignored default path, creation history and demo-seed anchors. That declaration is not deployment ownership evidence. Its inventory verdict is `DATA_PRESENT_REVIEW_REQUIRED`, and the aggregate verdict remains `INDEPENDENT_REVIEW_REQUIRED`.

Before a greenfield waiver can be issued, accountable owners must still enumerate every formerly deployable host, database path, persistent volume, object store and provider ledger; prove which environment owned this SQLite file; and independently confirm that none contains production business records. A production or unknown non-empty source stops release and restores the full two-rehearsal migration path.

## Change impact

This checkpoint changes no page, API, PostgreSQL table, event, permission, financial record or historical record. The new inventory tool is read-only, hashes source locations and bytes, records table-level counts only, refuses evidence overwrite, never grants PASS and fails closed for non-empty production or unknown sources. Rollout is execution-only in the controlled evidence workspace; rollback is removal of the tool and documentation, with no data mutation to reverse.
