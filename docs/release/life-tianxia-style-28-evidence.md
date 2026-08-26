# LIFE-STYLE-28 evidence — 门店团购深层视觉迁移

## Scope

- Continue presentation-only migration from the reviewed 天下摄影 consumer source.
- Cover city/store discovery, variant selection, trace report, group-buy event and PAGE-216/218/221 deep surfaces.
- Keep Life discovery, location permission, inventory, cart and trace-report APIs authoritative.

## Implemented

- PAGE-198: compact city header, CSS-native location mark, scenario shortcuts, distance badges and denser active-store cards.
- PAGE-210: selected-product summary, two-column variant choices, quantity control, calculated selection total and sticky cart rail.
- PAGE-211: valid-report seal, verification/expiry cards and structured evidence timeline without manufacturing missing evidence.
- PAGE-213: image-backed group-buy banner and shared formal product cards connected to the existing cart endpoint.
- PAGE-216/218: image-backed nearby-store cards, formal store header and shared two-column product shelf.
- PAGE-221: group-buy image, live price/inventory/store facts and explicit server revalidation notice.

## Verification

- Life targeted suite: 8 files / 53 tests passed.
- Life structure gate passed: V6.3 five image tabs and 38 independent leaves.
- Life H5 and `mp-weixin` production builds passed.
- In-app browser at 390×844 rendered PAGE-198/210/211/213/216/218 safe-close states. Each had a 375 CSS px document within the viewport, no horizontal overflow and no console warning/error.

## Honest boundary

- Browser checks covered unauthenticated and safe-close states only; authenticated PostgreSQL normal-data layouts remain unclaimed.
- WeChat DevTools, real-device, controlled providers and payment evidence remain unclaimed.
- Per user instruction this stage is not committed or pushed.
