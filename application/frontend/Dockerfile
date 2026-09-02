# =============================================================================
# DevShop Customer Frontend - Multi-stage Docker build
#   Build stage : node:22-alpine   (npm ci + vite build)
#   Run stage   : nginx:1.27-alpine (static file server + API reverse proxy)
#
# The browser calls relative /api URLs on the SAME origin (port 5173). Nginx
# in this image reverse-proxies /api/* to the backend service over the Docker
# network (backend:8080). No backend hostname/IP is baked into the JS bundle,
# so the frontend works on localhost, any EC2 IP, or a domain without rebuild.
# =============================================================================

# ---- Stage 1: Build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# ---- Stage 2: Runtime ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
