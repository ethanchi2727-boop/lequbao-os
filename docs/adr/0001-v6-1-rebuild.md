# ADR 0001: V6.1 controlled rebuild

## Status

Accepted for the `upgrade/v6.1-rebuild` branch.

## Context

The V5 repository is a Vue/UniApp, npm, Fastify, and SQLite monorepo with multiple product-facing applications. V6.1 freezes two public products, a tenant-first PostgreSQL model, durable workflows, immutable ledgers, AI/Harness execution boundaries, and complete consumer and merchant journeys. Preserving the V5 topology would keep conflicting product names, duplicated application responsibilities, and a persistence model that cannot satisfy RLS or real migration gates.

## Decision

- Keep this Git repository and its history. Preserve remote `main` as the V5 rollback point.
- Build a TypeScript modular monolith plus asynchronous worker before considering microservices.
- Use PostgreSQL 15+ as the only V6.1 business source of truth. Redis and object storage are optional infrastructure, never money truth.
- Adopt the target application topology: 乐趣宝 Web/H5, platform administration, 乐趣生活 mini program, one merchant mini-program template, API, and worker.
- Use one package manager and lockfile for V6.1. The exact pnpm and framework versions are selected and locked during scaffolding, after compatibility checks.
- Treat React Web and native WeChat TypeScript as the preferred target, but require their scaffold to pass the first vertical gate before deleting the corresponding legacy UI implementation.
- Move V5 code to a read-only `legacy-reference/v5` area as the new applications take ownership. It is not imported by production builds.
- Reuse V5 behavior only through explicit contract tests, data mappings, or isolated code extraction.
- Integrate DeepSeek Harness only at its pinned commit through a repository-owned Adapter, AI Gateway, and Tool Gateway. Harness is never the business database or user-facing product identity.

## Consequences

- Existing application entry points will be replaced rather than continuously patched.
- Database migration is a separate product deliverable with row, amount, identity, and policy reconciliation.
- Until the new vertical gate passes, both V5 rollback and V6.1 rebuild remain available in Git, but only one is deployed in each environment.
- Real payment, reward-balance migration, and payouts remain blocked by their written financial gates.
