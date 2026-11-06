import { Hono } from 'hono';
import { createConnection } from './db/connection';
import { VisitorService } from './services/visitor-service';
import { createVisitorsRouter } from './routes/visitors';
import { createWechatRouter } from './routes/wechat';

let _app: Hono | null = null;

/**
 * 组装并返回 Hono app 实例（延迟初始化，便于测试时先设置环境变量）。
 */
export function getApp(): Hono {
  if (_app) return _app;

  const dbPath = process.env.DB_PATH || 'data/visitors.db';
  const db = createConnection(dbPath);
  const visitorService = new VisitorService(db);

  const app = new Hono();

  // API 路由
  app.route('/api/visitors', createVisitorsRouter(visitorService));
  app.route('/api/wechat', createWechatRouter());

  // 健康检查
  app.get('/health', (c) => c.json({ status: 'ok' }));

  _app = app;
  return app;
}
