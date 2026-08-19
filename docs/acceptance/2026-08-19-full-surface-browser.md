# Full-surface Workbench browser acceptance — 2026-08-19

## Scope

This local acceptance checks the final control-plane page registry and production Web assets. The local acceptance server provided an employee session but intentionally returned no domain data for the newly connected APIs, so the observed state is a truthful empty/prerequisite state rather than simulated business success. It does not replace real PostgreSQL or provider acceptance.

## Results

- Desktop, 1280×720, PAGE-166 model routing and budgets:
  - rendered the authoritative page-owned form without demo labeling;
  - exposed no provider key, password or secret field;
  - clicking save with required fields empty focused the first missing field and issued no command;
  - document width equalled client width and no horizontal overflow occurred.
- Mobile, 390×844, PAGE-069 GEO channel publication:
  - rendered the mobile route, scoped publication inputs and the original non-collection/non-ranking statement;
  - exposed no demo labeling and no horizontal overflow;
  - retained the page-owned publish command while the absent API data rendered as empty rather than invented success.
- Mobile, PAGE-130 official plugin detail without `pluginCode`:
  - rendered an explicit missing-prerequisite state;
  - exposed no enabled install action;
  - had no horizontal overflow.
- Across the checks, the browser console reported zero warnings or errors.

## Boundary

Real authenticated data, PostgreSQL constraints/RLS, external GEO submission, WeChat devices and provider callbacks remain controlled-environment gates in `docs/release/stage-10-release-candidate-evidence.md`.
