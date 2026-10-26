import { rmSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// 使用隔离测试库（必须在导入依赖 db 的模块前设置）
const TEST_DB = './data/smoke-test.db';
process.env.DB_PATH = TEST_DB;

let createApp: () => import('hono').Hono;
let runMigrations: () => void;
let triggerDispatch: () => void;
let app: import('hono').Hono;

beforeAll(async () => {
  rmSync(TEST_DB, { force: true });
  ({ runMigrations } = await import('../db.js'));
  ({ createApp } = await import('../index.js'));
  ({ triggerDispatch } = await import('../services/dispatcher.js'));
  runMigrations();
  app = createApp();
});

afterAll(() => {
  rmSync(TEST_DB, { force: true });
});

async function call(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}
async function jsonBody(r: Response): Promise<Record<string, unknown>> {
  return (await r.json()) as Record<string, unknown>;
}

describe('API 路由冒烟（开发自检，非 QA E2E）', () => {
  it('POST /api/tasks 创建任务 → 201 且状态 pending', async () => {
    const r = await call('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tableId: 'table-1' }),
    });
    expect(r.status).toBe(201);
    const b = await jsonBody(r);
    expect(b.status).toBe('pending');
    expect(b.robotId).toBeNull();
    expect(typeof b.id).toBe('number');
    expect(typeof b.tableId).toBe('string');
  });

  it('POST /api/tasks 无效 tableId → 400 INVALID_TABLE_ID', async () => {
    const r = await call('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tableId: '' }),
    });
    expect(r.status).toBe(400);
    const b = await jsonBody(r);
    expect(b.code).toBe('INVALID_TABLE_ID');
  });

  it('GET /api/tasks 读回任务列表', async () => {
    const r = await call('/api/tasks');
    expect(r.status).toBe(200);
    const b = await jsonBody(r);
    const tasks = b.tasks as Array<Record<string, unknown>>;
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('POST /api/robots 注册 → 201 idle', async () => {
    const r = await call('/api/robots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Robot-A' }),
    });
    expect(r.status).toBe(201);
    const b = await jsonBody(r);
    expect(b.status).toBe('idle');
    expect(b.currentTaskId).toBeNull();
  });

  it('调度器自动分配：idle 机器人 + pending 任务 → delivering', async () => {
    // 触发一次分配
    triggerDispatch();
    const r = await call('/api/robots');
    const robots = (await jsonBody(r)).robots as Array<Record<string, unknown>>;
    expect(robots.some((x) => x.status === 'delivering')).toBe(true);
  });

  it('POST /api/robots/:id/arrive 送达 → delivered + 通知', async () => {
    const robots = ((await jsonBody(await call('/api/robots'))).robots) as Array<
      Record<string, unknown>
    >;
    const delivering = robots.find((x) => x.status === 'delivering');
    expect(delivering).toBeTruthy();
    const id = delivering!.id as number;
    const r = await call(`/api/robots/${id}/arrive`, { method: 'POST' });
    expect(r.status).toBe(200);
    const b = await jsonBody(r);
    expect(b.taskId).toBeDefined();
    expect(b.tableId).toBeDefined();
    expect(b.sentAt).toBeDefined();
    // 通知查询
    const nr = await call(`/api/notifications?taskId=${b.taskId}`);
    const nb = await jsonBody(nr);
    const list = nb.notifications as Array<Record<string, unknown>>;
    expect(list.length).toBe(1);
    expect(list[0].tableId).toBe(b.tableId);
  });

  it('监控接口可用', async () => {
    expect((await call('/api/monitor/overview')).status).toBe(200);
    expect((await call('/api/monitor/queue')).status).toBe(200);
    expect((await call('/api/monitor/robots')).status).toBe(200);
    expect((await call('/api/monitor/alerts')).status).toBe(200);
  });

  it('取消任务 → cancelled（待分配返回 null robotId，配送中返回原 robotId 并释放）', async () => {
    // 创建任务（若存在 idle 机器人会被自动分配为 delivering，否则保持 pending）
    const created = await call('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tableId: 'table-3' }),
    });
    const taskObj = (await jsonBody(created)) as { id: number };
    const before = (
      (await jsonBody(await call('/api/tasks'))).tasks as Array<Record<string, unknown>>
    ).find((x) => x.id === taskObj.id) as Record<string, unknown>;
    const wasDelivering = before.status === 'delivering';
    const r = await call(`/api/tasks/${taskObj.id}/cancel`, { method: 'POST' });
    expect(r.status).toBe(200);
    const b = await jsonBody(r);
    expect(b.status).toBe('cancelled');
    if (wasDelivering) {
      expect(b.robotId).not.toBeNull();
      // 配送中取消后机器人应回到 idle
      const robots = ((await jsonBody(await call('/api/robots'))).robots) as Array<
        Record<string, unknown>
      >;
      const rob = robots.find((x) => x.id === b.robotId);
      expect(rob?.status).toBe('idle');
    } else {
      expect(b.robotId).toBeNull();
    }
  });

  it('机器人置离线 → 生成 robot_offline 告警', async () => {
    // 注册一台全新机器人（idle），直接置 offline 触发告警
    const reg = await call('/api/robots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Offline-Robot' }),
    });
    const robot = (await jsonBody(reg)) as { id: number };
    const r = await call(`/api/robots/${robot.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'offline' }),
    });
    expect(r.status).toBe(200);
    const alerts = ((await jsonBody(await call('/api/monitor/alerts'))).alerts) as Array<
      Record<string, unknown>
    >;
    expect(alerts.some((a) => a.type === 'robot_offline')).toBe(true);
  });
});
