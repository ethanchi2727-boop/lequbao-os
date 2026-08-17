# Project state — V6.1 rebuild

## Active branch

`upgrade/v6.1-rebuild`

The remote `main` branch at commit `f70b4674c82f99db8424bba8854aeb8a7a11d362` is the preserved V5 rollback baseline.

## Current objective

Rebuild the repository around the V6.1 `乐趣宝 + 乐趣生活` baseline. Preserve verified business behavior and migration evidence, but do not preserve the V5 application topology, naming, SQLite persistence, or UI architecture merely for compatibility.

## Completed in this stage

- Located and checksum-verified the V6.1 formal package.
- Read the external unique baseline and current `00`–`07` package entry points.
- Inspected the product boundaries, commercial rules, page tree, state machines, UI overview, PostgreSQL schema, OpenAPI, events, RBAC, test gates, repository strategy, and development instructions.
- Created the V6.1 rebuild branch.
- Recorded frozen development rules and known package conflicts.

## Verified package facts

- 583 checksummed files, zero checksum mismatches.
- 307 page nodes and 197 leaf pages.
- 73 PostgreSQL tables, 37 target OpenAPI paths, 46 domain events.
- 15 roles, 51 permission controls, and 143 acceptance tests.
- The existing V5 repository has 134 OpenAPI paths and approximately 136 SQLite tables; replacement requires an explicit compatibility and migration matrix.

## Current blockers and risks

- The generated `0002_v6_1_永久收益权与AI对话建档.sql` contains literal `+` patch markers and cannot be executed as delivered.
- The frozen `70/10/20` distributable-income policy conflicts with a separate `25%` channel-distribution statement. V6.1 development uses the frozen versioned policy; production payout needs written business and finance resolution.
- Current material mixes `商务人员` and `商务推广人员`, and mixes `生活消费` and `生活`. The external unique baseline wins pending formal amendment.
- The target stack recommendation differs from the V5 implementation. The rebuild must use architecture decision records and must not mix package managers or duplicate long-lived app implementations.
- PostgreSQL schema execution, RLS isolation, payment sandbox, WeCom callbacks, backup recovery, and migration rollback have not yet been verified in a real environment.

## Exact next step

Import the current V6.1 contract sources into the repository, repair their reproducibility defects, create the V5-to-V6.1 keep/rewrite/migrate matrix, then scaffold the PostgreSQL modular-monolith foundation and its first real database/RLS quality gate.
