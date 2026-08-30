# =============================================================================
# DevShop Admin Frontend - Multi-stage Docker build
#   Build stage : node:22-alpine   (npm ci + vite build)
#   Run stage   : nginx:1.27-alpine (static file server)
#
# NOTE: VITE_API_BASE_URL is a BUILD-TIME variable baked into the static JS
# bundle. The browser runs OUTSIDE the Docker network, so it must reach the
# backend via a browser-reachable address (http://localhost:8080 for local
# Docker development) and NOT the in-network service name "backend".
# =============================================================================

# ---- Stage 1: Build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---- Stage 2: Runtime ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
