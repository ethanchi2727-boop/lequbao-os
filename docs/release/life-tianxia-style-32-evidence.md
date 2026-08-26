# LIFE-STYLE-32 evidence — 隐私、订阅与订单工具视觉迁移

## Scope

- Continue the formal Life V6.3 presentation migration across privacy, subscription and order-service tools.
- Preserve the platform-to-merchant session boundary, immutable policy-version evidence and server-owned order scope.
- Do not add a fabricated first-time subscription switch or bypass merchant context.

## Implemented

- PAGE-254: verified-context summary, trust facts, structured profile-fact records and retained copy/withdrawal actions.
- PAGE-255: formal subscription evidence/empty state that keeps first-time grant closed without published policy and official WeChat result.
- PAGE-259: order-tool summary and structured order cards for order detail, aftercare and merchant-scoped customer service.

## Verification

- Life targeted suite: 8 files / 59 tests passed.
- Life structure gate passed: V6.3 five image tabs and 38 independent leaves.
- Life H5 and `mp-weixin` production builds passed.
- In-app browser at 390×844 rendered PAGE-254/255/259 safe-close states. Each had a 375 CSS px document within the viewport, no horizontal overflow and no console warning/error.

## Honest boundary

- PAGE-254/255 correctly remained at the explicit no-merchant-context boundary; authenticated merchant-context normal data was not available.
- PAGE-259 correctly remained at the unauthenticated boundary; no order or aftercare action was submitted.
- Official WeChat subscription result, PostgreSQL mutation, provider/device and controlled-environment evidence remain unclaimed.
- Per user instruction this stage is not committed or pushed.
