# VISUAL-BAO-04 evidence — V6.2 mobile motherboard rebuild

Date: 2026-08-25

## Scope

This stage rebuilds the Bao UniApp presentation directly from the official
`MOBILE_CANONICAL_AI_OPERATIONS` and `MOBILE_CANONICAL_BUSINESS_REVENUE`
motherboards. It changes no API, PostgreSQL, money, permission, audit or
historical-data behavior.

## Defects removed

- Four used but undefined tokens: `ink-300`, `jade-300`, `radius-card` and
  `radius-control`.
- Visible stray `>` text emitted by all five primary page templates.
- The unconstrained desktop H5 layout that stretched a mobile page across the
  browser width.
- Native/custom title duplication between the first tab and the other tabs.
- Per-page raw radius and shadow declarations that bypassed the shared mobile
  theme.
- Presence-only tests that could pass while the rendered mobile layout was
  visibly wrong.

## Formal result

- All routes use the shared 58-pixel V6.2 custom top and one component/token
  namespace.
- H5 uses a centered 430-pixel phone canvas on wider browsers.
- H5 bottom navigation is 62 pixels high with the official 22-pixel image tabs
  and jade selected background.
- The ten tab SVG files remain byte-exact with the upgrade package.
- AI conversation uses the official context, user bubble, agent card, two-cell
  result and composer hierarchy.
- Work/task uses the official progress hero, ring, execution timeline and trust
  notice hierarchy.
- Business uses the official income hero, two summary cards and action-card
  hierarchy.
- Messages, identity and all 11 mobile-only deep tasks inherit the same formal
  components instead of defining a separate generic visual system.
- Unauthenticated production rendering preserves the motherboard structure but
  shows dashes and protected explanations rather than fabricated merchants,
  amounts or completion results.

## Automated verification

- Bao UniApp: five test files, 15 tests passed.
- Structure gate passed and now rejects undefined mobile tokens, scattered page
  visual constants, missing custom navigation and an unlocked H5 canvas.
- H5 production build passed.
- `mp-weixin` production build passed without unsupported-selector warnings.

## Browser evidence

The built H5 artifact was inspected through `/bao-mobile/` at the five primary
routes and `PAGE-191`:

- phone canvas: 430 pixels, centered in the available 1280-pixel viewport;
- top: 58 pixels;
- bottom navigation: 62 pixels;
- tab images: 22 by 22 pixels;
- AI card radius: 16 pixels;
- undefined rendered radii: none;
- visible stray `>` text: none;
- console errors: none.

The available in-app browser refused screenshot capture and did not expose
viewport emulation. No screenshot, 390-pixel, authenticated normal-data,
WeChat DevTools or real-device acceptance is claimed from this evidence.
