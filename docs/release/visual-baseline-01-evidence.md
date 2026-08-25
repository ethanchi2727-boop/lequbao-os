# VISUAL-BASELINE-01 evidence — official V6 baseline intake

## Scope

This stage establishes reviewable visual provenance and connects the official native tab assets. It does not change APIs, database schemas, persistence, money, permissions, audit behavior, or production data.

## Changed surfaces

- Accepted ADR-0013 and recorded the two unique UI baselines plus source archive hashes.
- Preserved the supplied SVG tab masters and generated deterministic 96×96 transparent PNG variants for UniApp native tab bars.
- Updated 乐趣生活 navigation to `首页/商城/生活圈/购物车/我的`.
- Updated 乐趣宝 mobile navigation to `对话/工作/任务/消息/我的`.
- Added structure gates that reject label drift, missing icon paths, or missing icon files.

The existing routes intentionally remain unchanged in this intake stage, so working business APIs stay connected while layouts migrate in later stages.

## Local verification

| Check                                      | Result                   |
| ------------------------------------------ | ------------------------ |
| 乐趣生活 structure gate                    | PASS                     |
| 乐趣宝 structure gate                      | PASS                     |
| 乐趣生活 Vitest                            | PASS — 4 files, 21 tests |
| 乐趣宝 Vitest                              | PASS — 3 files, 9 tests  |
| 乐趣生活 H5 production build               | PASS                     |
| 乐趣生活 `mp-weixin` production build      | PASS                     |
| 乐趣宝 mobile H5 production build          | PASS                     |
| 乐趣宝 mobile `mp-weixin` production build | PASS                     |

The UniApp compiler emitted only its optional upgrade notice. It did not report a build failure.

## Evidence boundary

This evidence is local and static. It is not WeChat DevTools/device acceptance, browser screenshot acceptance, authenticated provider/database verification, CI evidence, or deployment approval.

## Next stage

Implement the 乐趣生活 V6.3 shared theme tokens and runtime top safe-area/capsule contract, then migrate the five primary pages against real existing API data without changing business behavior.
