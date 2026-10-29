# 在云服务器上构建（deploy-cloud skill 负责；本机不需要 Docker），工作区根为构建上下文：
#   docker build -f deploy/Dockerfile -t jlg-ticket .
# 所选共享模块使用随工作区交付的 vendor/ 本地包。
FROM node:22-slim AS builder
# better-sqlite3 等原生模块需要 node-gyp 编译，slim 镜像缺编译工具链；
# 只装在 builder 阶段，运行镜像保持 slim（编译产物随 node_modules 拷过去）
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/ ./vendor/
COPY app/jlg-ticket/package.json ./app/jlg-ticket/
RUN npm ci
COPY app/jlg-ticket/ ./app/jlg-ticket/
RUN npm run build -w jlg-ticket && npm prune --production

FROM node:22-slim
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/app/jlg-ticket /app/app/jlg-ticket
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/app/jlg-ticket
CMD ["node", "--import", "tsx", "src/server/index.ts"]
