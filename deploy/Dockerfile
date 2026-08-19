# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS source
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile

FROM source AS api-build
RUN pnpm --filter @lequ/contracts build \
 && pnpm --filter @lequ/api build \
 && pnpm --filter @lequ/api deploy --prod --legacy /opt/lequ

FROM source AS worker-build
RUN pnpm --filter @lequ/contracts build \
 && pnpm --filter @lequ/worker build \
 && pnpm --filter @lequ/worker deploy --prod --legacy /opt/lequ

FROM source AS web-build
RUN pnpm --filter @lequ/workbench-web build

FROM node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node

FROM runtime AS api
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=api-build --chown=node:node /opt/lequ/ /app/
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]

FROM runtime AS worker
COPY --from=worker-build --chown=node:node /opt/lequ/ /app/
CMD ["node", "dist/main.js"]

FROM runtime AS web
ENV HOST=0.0.0.0
ENV PORT=8080
ENV WORKBENCH_STATIC_ROOT=/app/dist
COPY --from=web-build --chown=node:node /workspace/apps/workbench-web/dist/ /app/dist/
COPY --from=web-build --chown=node:node /workspace/apps/workbench-web/production-server.mjs /app/production-server.mjs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "production-server.mjs"]
