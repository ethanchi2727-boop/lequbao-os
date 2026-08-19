# Workbench production fail-closed browser acceptance

Date: 2026-08-19

Candidate state: local uncommitted V6.1 worktree; no Git commit or push was created.

## Scope

- Built `apps/workbench-web/dist` and served it through `production-server.mjs`.
- Opened `/bao/page-014` without `demo=1` and without an employee session token.
- Repeated the check at the default desktop viewport and a 390×844 mobile override.
- Inspected rendered text, navigation targets, horizontal dimensions and browser warning/error logs.

## Result

- Production rendering contained none of the demo employee, merchant, location, fixed 82% progress or fixed task-count values.
- The brand, eight desktop navigation entries and five mobile navigation entries point to real `/bao/page-*` routes; the production brand does not add `demo=1`.
- Demo-only network, skill and plugin composer controls and the sample delivery badge were absent.
- Missing employee authority rendered the explicit denied state; missing intake session rendered “等待权威会话” with zero fields, zero sources and zero progress rather than sample records.
- Browser-only send, upload and confirmation paths are guarded by the production UI policy and cannot claim success without both the live service and authoritative session.
- Desktop scroll width equalled client width. Under the mobile override, effective client and scroll widths were both 375 px and the bottom navigation rendered as flex.
- Browser warning/error log count was zero at both widths.
- The final visual pass rendered 24 code-native inline SVG icons, found no legacy Unicode placeholder icon in production, kept scroll width equal to client width and emitted no browser warning/error.

Demo mode was checked separately: `demo=1` retained the persistent “演示模式 · 非真实业务数据” label and kept sample content isolated to that explicitly labelled mode.
