// server.js — Hono 服务入口
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { initDb, closeDb } from './server/db.js';
import { startScheduler, stopScheduler } from './server/scheduler.js';
import areasRoutes from './server/routes/areas.js';
import jobsRoutes from './server/routes/jobs.js';
import obstaclesRoutes from './server/routes/obstacles.js';
import suppliesRoutes from './server/routes/supplies.js';
import reportsRoutes from './server/routes/reports.js';

const app = new Hono();

// API 路由
app.route('/', areasRoutes);
app.route('/', jobsRoutes);
app.route('/', obstaclesRoutes);
app.route('/', suppliesRoutes);
app.route('/', reportsRoutes);

// 健康检查
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// 初始化数据库并启动调度器
initDb();
startScheduler();

// 优雅关闭
process.on('SIGINT', () => {
  stopScheduler();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopScheduler();
  closeDb();
  process.exit(0);
});

// 启动服务
const port = parseInt(process.env.PORT || '3000', 10);
console.log(`商场清洁系统服务启动，端口 ${port}`);

serve({ fetch: app.fetch, port });

export default app;
