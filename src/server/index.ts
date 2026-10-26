import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { runMigrations } from './db.js';
import { tasks } from './routes/tasks.js';
import { robots } from './routes/robots.js';
import { notifications } from './routes/notifications.js';
import { monitor } from './routes/monitor.js';
import { startDispatcher } from './services/dispatcher.js';
import { errorResponse } from './errors.js';

/** 组装 Hono 应用（API + 静态托管）。不启动服务、不启动调度器。 */
export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.route('/api/tasks', tasks);
  app.route('/api/robots', robots);
  app.route('/api/notifications', notifications);
  app.route('/api/monitor', monitor);

  app.notFound((c) => errorResponse(c, 'INTERNAL_ERROR', 'not found'));
  app.onError((err, c) => {
    console.error('[server] unhandled error:', err);
    return errorResponse(c, 'INTERNAL_ERROR', err.message);
  });

  // 前端静态文件托管（dist/，由 T02 构建产出；dist/ 不存在时仅 API 可用）
  app.use('/*', serveStatic({ root: './dist' }));
  return app;
}

function main(): void {
  // 1. 执行数据库迁移
  runMigrations();
  // 2. 启动后台调度器轮询
  startDispatcher(Number(process.env.DISPATCH_INTERVAL_MS ?? 1000));
  // 3. 启动 Hono 服务
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp();
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] catering-delivery API listening on http://localhost:${info.port}`);
    console.log(`[server] db=${process.env.DB_PATH ?? './data/catering.db'}`);
  });
}

// 仅在直接执行（tsx src/server/index.ts）时启动服务
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
