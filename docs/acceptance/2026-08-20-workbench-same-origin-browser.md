# Workbench same-origin browser acceptance — 2026-08-20

## Scope

The production Web build was served by the repository-owned production server and opened at the PAGE-014 route with a deliberately hostile cross-origin `apiBase` query value. No employee session was injected for this check.

## Result

- The page rendered the truthful denied state, `当前身份没有建档权限`, because no authoritative employee session existed.
- The hostile host was not rendered or used as application state; the production entrypoint always selected `location.origin`.
- Browser console warnings/errors: 0.
- Horizontal overflow: none (`scrollWidth` equalled `clientWidth`, 1265 px).
- The API-client regression suite separately proves that a cross-origin base is rejected with `UNSAFE_API_ORIGIN` before any authenticated request can be created.

This is local browser evidence only. It does not replace the controlled candidate-image, ingress, identity-provider or production-environment acceptance suites.
