# syntax=docker/dockerfile:1
#
# @falcon/web - C3PO, served by nginx and proxying /api to the api service.
# Build from the repo root, never from this directory (the pnpm workspace is the build context):
#
#   docker build -f packages/web/Dockerfile -t falcon-web .
#
# The image is static: the API's origin is nginx's `proxy_pass`, not a build-time variable, so this image
# is universe-agnostic and rebuild-free when the backend moves. See docker-compose.yml.

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Manifests first: dependencies re-resolve only when a package.json or the lockfile changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/

# `--filter @falcon/web` with no trailing `...`: the frontend has no workspace dependencies, so this
# installs neither @falcon/core nor the native better-sqlite3 - no compiler in this image, ever.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @falcon/web

# `packages/web/tsconfig.json` is standalone, so the package directory is the whole input to `tsc && vite build`.
COPY packages/web packages/web
RUN pnpm --filter @falcon/web run build

FROM nginx:1.27-alpine AS runtime
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/index.html || exit 1
