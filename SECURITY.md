# Security notes

## Supported runtime

- Node.js 22.5+
- API binds to `127.0.0.1` by default.
- The H5 development server binds to `127.0.0.1` and must not be exposed to an untrusted network.

## Identity boundary

- Local development uses opaque demo bearer tokens whose SHA-256 digests are stored in SQLite.
- Demo identities are never seeded when `NODE_ENV=production`; setting `LEQU_SEED_DEMO_AUTH=false` disables them in any environment.
- Production deployment must provide an OAuth 2.1/OIDC adapter, short-lived access tokens, key rotation, revocation and step-up authentication before the authentication item can be accepted.
- Authorization is enforced by the API with role, tenant, data-scope, field and AI-risk checks. Client-side visibility is never treated as an authorization control.

## Dependency review

The API runtime is limited to Fastify, CORS, Zod and Node built-ins. The uni-app official toolchain currently pins older Vite and transitive image/build utilities that `npm audit` reports as build-time advisories. They are not shipped as Node services in the generated static H5 bundle.

Until the upstream uni-app preset moves to a patched compiler stack:

1. do not expose the development server publicly;
2. build in an isolated CI worker;
3. deploy only the generated static bundle and API artifact;
4. do not process untrusted ZIP/JPEG inputs in the build worker;
5. re-run `npm audit` when upgrading the official uni-app compiler.

No critical advisory was reported at delivery time. Do not apply `npm audit fix --force`; it would replace compiler-pinned packages and can invalidate multi-platform builds.
