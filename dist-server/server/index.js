import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getDb } from './db.js';
import plots from './routes/plots.js';
import assessments from './routes/assessments.js';
import tasks from './routes/tasks.js';
import monitoring from './routes/monitoring.js';
import exceptions from './routes/exceptions.js';
import statistics from './routes/statistics.js';
const app = new Hono();
// API 路由
app.route('/api/plots', plots);
app.route('/api/assessments', assessments);
app.route('/api/tasks', tasks);
app.route('/api/exceptions', exceptions);
app.route('/api/monitoring', monitoring);
app.route('/api/statistics', statistics);
// 生产环境：托管前端构建产物（SPA）
app.use('/*', serveStatic({ root: './dist' }));
// SPA fallback — 未匹配的路径返回 index.html
app.get('/*', serveStatic({ path: './dist/index.html' }));
// 初始化数据库
getDb();
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
});
export default app;
