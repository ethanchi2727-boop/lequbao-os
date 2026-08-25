# RELEASE-LOCAL-12 evidence

Date: 2026-08-25

Candidate commit under test: `60ef4cf`

## Full local release gate

`pnpm check` completed successfully from the repository root.

- Formatting, ESLint, all workspace type checks and all production builds passed.
- 73 source tables, 164 audited target tables, 307 nodes, 197 leaves and 46 events passed the V6 contract checks.
- The release plan contains 143 acceptance tests: 111 locally automated, 3 locally reviewed and 29 controlled-environment pending.
- The test run completed 955 tests: tooling 191, consumer mini-program 3, 乐趣宝 9, merchant 32, 乐趣生活 41, Workbench 292, contracts 11, Worker 29 and API 347.
- OpenAPI contains 201 paths. Security inspection covered 717 text files, 760 SBOM components and 364 production dependency versions with no embedded production-secret pattern found.
- The final artifact gate passed for API, Worker, Workbench Web, 乐趣生活 H5, 乐趣宝 mobile and the mini-program/contracts outputs.
- 乐趣生活 H5 contains 99 files and 4,798,224 bytes. The aggregate artifact manifest is `083b17f9ddc73dd7`.

## Real browser preview

The built 乐趣生活 H5 artifact was served locally from `apps/life-uniapp/dist/build/h5` under its production `/life/` base path and inspected with the in-app Chromium browser.

- Mobile viewport `390x844`: the rendered document width was 375 px with no horizontal overflow. The home surface rendered all 15 frozen categories.
- Desktop viewport `1024x768`: the product surface was centered at 480 px, the document stayed within the 1009 px available layout width and no horizontal overflow occurred.
- The home-to-mall and home-to-cart tab paths navigated to `/life/#/pages/mall/index` and `/life/#/pages/cart/index`.
- Official V6.3 tab images loaded successfully. The unauthenticated mall and cart states remained truthful and did not fabricate products, prices or cart contents.
- Browser runtime logs were empty.

## Evidence boundary

This is local build and browser evidence only. Authenticated PostgreSQL-backed normal states, official WeChat DevTools/device acceptance, payment/provider callbacks, production image publication and the 29 controlled-environment cases were not run and remain release gates.
