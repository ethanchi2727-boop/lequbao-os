# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS source
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile

FROM source AS preview
ENV NODE_ENV=development
ENV LEQU_DEVELOPMENT_MOCKS=1
ENV VITE_LEQU_DEVELOPMENT_MOCKS=1
ENV VITE_LEQU_PREVIEW_DATA=1
ENV HOST=0.0.0.0
ENV PORT=8080
RUN pnpm --filter @lequ/contracts build \
 && pnpm --filter @lequ/life-uniapp build:h5 \
 && pnpm --filter @lequ/bao-uniapp build:h5
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const fs=require('node:fs');const marker='/tmp/lequ-worker-ready';if(!fs.existsSync(marker)||Date.now()-fs.statSync(marker).mtimeMs>30000)process.exit(1);fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bash", "deploy/start-bao-preview.sh"]

FROM source AS api-build
RUN pnpm --filter @lequ/contracts build \
 && pnpm --filter @lequ/api build \
 && pnpm --filter @lequ/api deploy --prod --legacy /opt/lequ

FROM source AS worker-build
RUN pnpm --filter @lequ/contracts build \
 && pnpm --filter @lequ/worker build \
 && pnpm --filter @lequ/worker deploy --prod --legacy /opt/lequ

FROM source AS web-build
RUN pnpm --filter @lequ/workbench-web build \
 && pnpm --filter @lequ/life-uniapp build:h5 \
 && pnpm --filter @lequ/bao-uniapp build:h5

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
ENV WORKBENCH_STATIC_ROOT=/app/workbench
ENV LIFE_STATIC_ROOT=/app/life
ENV BAO_MOBILE_STATIC_ROOT=/app/bao-mobile
COPY --from=web-build --chown=node:node /workspace/apps/workbench-web/dist/ /app/workbench/
COPY --from=web-build --chown=node:node /workspace/apps/life-uniapp/dist/build/h5/ /app/life/
COPY --from=web-build --chown=node:node /workspace/apps/bao-uniapp/dist/build/h5/ /app/bao-mobile/
COPY --from=web-build --chown=node:node /workspace/apps/workbench-web/production-server.mjs /app/production-server.mjs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "production-server.mjs"]
