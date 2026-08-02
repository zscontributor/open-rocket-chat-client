# Build from the directory that CONTAINS both checkouts, not from this
# repository root:
#
#   your-workspace/
#   ├── open-rocket-chat-client      ← this repository
#   └── open-rocket-chat-gateway
#
#   cd your-workspace
#   docker build -f open-rocket-chat-client/docker/web.Dockerfile \
#     --build-arg VITE_GATEWAY_URL=https://chat.example.com \
#     --build-arg VITE_BUILD_ID=$(git -C open-rocket-chat-client rev-parse --short HEAD) \
#     -t zsoft/open-rocket-chat-web .
#
# The parent directory has to be the context because this repository resolves
# `@open-rocket-chat/api-contract` from the gateway checkout through a pnpm
# `link:` override, and a link cannot reach outside the build context. Once the
# contract is published to npm, the override goes away and this collapses back
# to an ordinary single-repository build.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /src

FROM base AS build

# The gateway checkout is here only for the contract package the override
# points at. Building it first is the same order CI uses: without it the
# client has nothing to compile against.
COPY open-rocket-chat-gateway/ open-rocket-chat-gateway/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  cd open-rocket-chat-gateway \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @open-rocket-chat/api-contract build

COPY open-rocket-chat-client/ open-rocket-chat-client/
WORKDIR /src/open-rocket-chat-client
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Baked into the bundle at build time, so an image is tied to one gateway
# origin. Leave it empty when the gateway is served from the same origin.
ARG VITE_GATEWAY_URL=""
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL

# Keys the persisted query cache in IndexedDB. Give every image a distinct
# value — a commit SHA is the obvious one — so a returning browser starts cold
# rather than restoring a cache an older build wrote.
ARG VITE_BUILD_ID=""
ENV VITE_BUILD_ID=$VITE_BUILD_ID

RUN pnpm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /src/open-rocket-chat-client/apps/web/dist /usr/share/nginx/html
COPY open-rocket-chat-client/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
