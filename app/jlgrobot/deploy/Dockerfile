# Builder stage — install all deps, build frontend, prune dev deps
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/ /app/vendor/
COPY app/jlgrobot/ /app/app/jlgrobot/
RUN npm ci
RUN npm run build -w jlgrobot
RUN npm prune --omit=dev

# Production stage — copy built artifacts from builder, no build tools needed
FROM node:20-bookworm-slim AS production
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/vendor/ /app/vendor/
COPY --from=builder /app/app/jlgrobot/ /app/app/jlgrobot/
COPY --from=builder /app/node_modules/ /app/node_modules/

WORKDIR /app/app/jlgrobot
ENV PORT=3000
ENV DB_PATH=/app/app/jlgrobot/data/application.db
EXPOSE 3000
CMD ["npm", "start"]
