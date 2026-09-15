# syntax=docker/dockerfile:1
#
# @falcon/api - the Millennium Falcon's onboard computer.
# Build from the repo root, never from this directory (the pnpm workspace is the build context):
#
#   docker build -f packages/api/Dockerfile -t falcon-api .
#
# The universe is deliberately NOT baked in: `millennium-falcon.json` and its `routes_db` are mounted at
# runtime and `FALCON_CONFIG_PATH` points at them, so one image serves any universe. See docker-compose.yml.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm's version is pinned by the root package.json's `packageManager` field; corepack honours it.
RUN corepack enable
WORKDIR /app

# Manifests only. This layer - and therefore every install below it - stays cached until a package.json
# or the lockfile changes, so editing source never re-resolves dependencies.
FROM base AS manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/

# `better-sqlite3` is a native addon: prebuild-install fetches a matching binary when one exists and falls
# back to compiling from source. The toolchain lives only in the two dependency stages, which are
# discarded; the runtime image below carries the compiled `.node` and nothing else.
FROM manifests AS toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# `--filter @falcon/api...` = the API plus its workspace dependencies (@falcon/core), never `web` or `cli`.
FROM toolchain AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @falcon/api...
# `packages/core/tsconfig.json` extends the root base config, which tsup's dts build reads.
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/api packages/api
RUN pnpm --filter @falcon/api... run build

FROM toolchain AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter @falcon/api...

# Node 24, matching .nvmrc: the compiled better-sqlite3 addon in prod-deps is ABI-bound to this version.
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    FALCON_CONFIG_PATH=/config/millennium-falcon.json
WORKDIR /app
# The whole workspace tree, because tsup keeps `dependencies` external: `dist/server.js` resolves fastify,
# better-sqlite3 and the `@falcon/core` symlink through these node_modules at runtime.
COPY --from=prod-deps /app ./
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/api/dist packages/api/dist
USER node
EXPOSE 4000
# `GET /api/health` is what compose gates the web container on. Exec form, so `$PORT` is expanded by
# node and not by /bin/sh (the shell form of HEALTHCHECK breaks on `${...}` with "Bad substitution").
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "packages/api/dist/server.js"]
