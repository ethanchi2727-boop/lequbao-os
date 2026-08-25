# VISUAL-BAO-03 evidence — V6.2 full page-family migration

Date: 2026-08-25

## Scope

This stage replaces the remaining legacy shared production renderer with the official Bao V6.2 page-family system. It does not alter business rules, API contracts, PostgreSQL tables, permissions, money, audit or historical facts.

The frozen page tree contains levels 2 through 6 only:

- 25 level-2 navigation/domain nodes;
- 85 level-3 grouping nodes;
- 182 level-4 executable leaves;
- eight level-5 executable leaves;
- seven level-6 executable leaves.

Levels 7 through 10 do not exist in the authoritative tree and were not fabricated. The frontend gate now rejects hierarchy outside the formal level-2-through-10 boundary, so future deeper leaves must enter the same governed matrix.

## PC and responsive Web result

The 19 previously designed Bao leaves retain their dedicated AI/intake interfaces. The other 116 Bao leaves now render through `bao-v62-experience-page.mjs` instead of the legacy `dedicated-page` or persistent `generic-page` presentation.

The shared formal system provides:

- deep-ink V6.2 hero, jade primary actions and AI-purple only for the AI family;
- explicit business family, role, API-domain and server-permission context;
- authoritative-data, protected-empty and demo-labelled presentation boundaries;
- a four-step task path derived from each page's existing dedicated experience contract;
- a visible guardrail on every page and stronger amber control on level-5/6 tasks;
- responsive PC and mobile layouts without duplicating business records;
- preserved route actions, help/audit entry and eight-state application shell.

Production empty states never use the five motherboard sample merchants, amounts or operating results. Live content still comes only from the existing same-origin API client after server identity, tenant, permission and resource-scope checks.

## Bao UniApp mobile result

The official five-tab package now exposes all 11 mobile-only leaves through a formal task directory and one governed detail route:

`PAGE-180`, `181`, `183`, `184`, `185`, `187`, `188`, `189`, `191`, `193`, and `195`.

Each page keeps its official task title, four-step structure, owning tab and execution guardrail. The detail route links back to the existing authoritative tab data source and does not fabricate delivery, revenue, conversation, order, redemption or identity results. Unknown page identifiers fail closed.

## Completion truth

`frontend-page-completion.json` now records all 197 executable leaves as `contracted`, `connected`, `designed` and `interactive`. Every record remains `accepted: false` until the required browser, authenticated data, WeChat DevTools/device and controlled-environment evidence is attached.

## Verification performed

- Workbench V6.2 page-family test covers exactly 116 newly migrated leaves and all level-5/6 controls.
- Bao UniApp mobile registry test covers all 11 mobile-only leaves and five-tab reachability.
- Workbench production build passes.
- Bao H5 and `mp-weixin` production builds pass.
- Workbench initial-route performance remains inside the unchanged budget.
- Frontend productization gate passes with 197 synchronized records.

The complete repository `pnpm check` gate passed on 2026-08-25. It covered
formatting, lint, contracts, RBAC, release, acceptance, visual, frontend,
cross-surface, security, operations, deployment, type checks, all test suites,
all production builds and release-artifact generation.

## Local browser smoke evidence

The production preview was opened at `http://127.0.0.1:8080` and the following
representative routes were inspected in the in-app browser:

- level 4: `/bao/page-026`;
- level 5: `/bao/page-039` and `/bao/page-158`;
- level 6: `/bao/page-040`;
- Bao mobile deep task: `/bao-mobile/#/pages/detail/index?pageId=page-191`.

All PC representatives rendered their route-specific V6.2 title, protected
authoritative-data state, task path, guardrail and help/audit entry. The server
permission denial remained visible for the unauthenticated local session. None
had horizontal overflow at the available 1280-pixel browser viewport.

The mobile route rendered the official `PAGE-191` scan-redemption task, all four
steps, execution boundary and authoritative-data entry without horizontal
overflow. The browser console contained no errors. This browser session did not
provide screenshot capture or viewport emulation, so it is not claimed as a
390-pixel screenshot or real-device result.

## Unclaimed evidence

- authenticated normal-data browser review across every page family;
- screenshot comparison at formal PC and mobile reference viewports;
- WeChat DevTools and real-device rendering;
- real provider, payment and controlled-preproduction acceptance.
