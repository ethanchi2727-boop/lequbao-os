FROM node:22.23.1-bookworm

USER root
RUN apt-get update \
  && apt-get install --yes --no-install-recommends postgresql-client curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

USER node
