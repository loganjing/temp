import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { getDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { registerApiRoutes } from './routes/api.js';
import { AppError } from './domain/errors.js';

/**
 * 常规服务入口（架构基线 1.2/1.6）：
 * - 启动时执行 migrations/sqlite/ 编号迁移（DB_PATH 可覆盖，父目录自建）
 * - 挂载 /api 路由（X-User-Id 解析与校验见 src/routes/api.js）
 * - 托管 dist/ 静态资源（前端构建产物，SPA 回退 index.html）
 * - PORT 环境变量（默认 3000；PORT=0 时由系统分配空闲端口）
 */

const app = new Hono();

const db = getDb();
const migrationResult = runMigrations(db);
if (migrationResult.newlyApplied.length > 0) {
  console.log(
    `[db] applied migrations: ${migrationResult.newlyApplied.join(', ')} (total ${migrationResult.total})`,
  );
}

registerApiRoutes(app, db);

// 静态资源托管：dist/ 由前端任务构建（npm run build）
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ root: './dist', path: 'index.html' }));

// 统一错误响应（契约第 1 节错误格式）
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('[server] unhandled error:', err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
    500,
  );
});

app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: '资源不存在' } }, 404),
);

function resolvePort() {
  const raw = process.env.PORT;
  if (raw === undefined || String(raw).trim() === '') return 3000;
  const port = Number(String(raw).trim());
  if (!Number.isInteger(port) || port < 0) return 3000;
  return port;
}

const port = resolvePort();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] listening on http://127.0.0.1:${info.port}`);
});
