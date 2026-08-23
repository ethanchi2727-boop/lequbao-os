# Life transaction routes browser acceptance — 2026-08-23

## Scope

This local H5 check covers representative dedicated routes from the second Life productization slice: PAGE-216, PAGE-227, PAGE-231 and PAGE-240. It verifies frozen URL routing, fail-closed presentation, responsive width and the unauthenticated recovery entry. It does not claim an authenticated PostgreSQL transaction, WeChat device rendering, location permission, provider payment or refund completion.

## Evidence

- The same UniApp source completed H5 and `mp-weixin` production builds before the browser run.
- At 1024×768, all four public paths resolved to their matching UniApp page hash and exact page title. `documentElement.scrollWidth` remained 1024 for every route.
- At 390×844, viewport, body and document widths remained exactly 390 for every route; no horizontal overflow was observed.
- PAGE-216 and PAGE-227 failed closed without a consumer session and exposed an explicit recovery action. Clicking PAGE-216's login recovery action reached the real `我的` account page and its WeChat/mobile-OTP entry.
- PAGE-231 and PAGE-240 did not invent an order, payment result or refund when their required identifiers were absent.
- The browser console contained no warning or error entries during the four-route desktop and mobile checks.

## Remaining controlled evidence

- Authenticated normal, empty, conflict and retry states against a real PostgreSQL/API stack.
- WeChat DevTools and physical-device visual/touch acceptance for the 14 new routes.
- Real location authorization, WeChat Pay sandbox callback, refund provider and merchant fulfilment evidence.
