# Official visual baseline manifest

This directory records the accepted 2026-08-25 visual sources. See ADR-0013 for their deliberately narrow precedence over V6.1.

| Product  | Repository baseline                   | Authoritative source SHA-256                                       |
| -------- | ------------------------------------- | ------------------------------------------------------------------ |
| 乐趣生活 | `baselines/乐趣生活V6.3唯一UI基线.md` | `08CF519F653760C7C87F1F114883F6CB5E81C82163036735A8AFDD55C70DE46F` |
| 乐趣宝   | `baselines/乐趣宝V6.2唯一UI基线.md`   | `BA3F1DE5B42680C7A524F5EDA8517E04AAA45930F3B6E543B157CEFD2E85105A` |

The unpatched 乐趣生活 V6.3 archive (`50A56618896914793351A46EA78AC3A68B76A28C10F160A9BC96E85CCDA255D6`) is retained only as provenance. The full WeChat-top package supersedes it.

Official tab SVG masters are stored with each UniApp product. The adjacent PNG files are 96 by 96 transparent rasterizations used by native tab bars; SVG masters remain the reviewable source.

These materials do not authorize changes to business logic, APIs, database schemas, persistence, payment, settlement, permissions, audit, or historical records.
