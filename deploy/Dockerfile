# npm + Vite static SPA; the project root is the build context.
# lingee-managed-build-sources-v1
ARG LINGEE_IMAGE_REGISTRY=docker.m.daocloud.io/library
FROM ${LINGEE_IMAGE_REGISTRY}/node:22-alpine AS builder
ARG LINGEE_NPM_REGISTRY=https://registry.npmmirror.com
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=${LINGEE_NPM_REGISTRY}
COPY . .
RUN npm run build

FROM ${LINGEE_IMAGE_REGISTRY}/nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf '%s\n' 'server {' '  listen 80;' '  root /usr/share/nginx/html;' '  index index.html;' '  location / { try_files $uri $uri/ /index.html; }' '  location = /health { access_log off; return 200 "ok"; add_header Content-Type text/plain; }' '  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }' '}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
