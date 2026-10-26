import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  overview,
  queue,
  monitorRobots,
  monitorAlerts,
} from '../services/monitor-service.js';
import { subscribe } from '../events.js';
import { resolveAlert, createAlert } from '../services/alert-service.js';
import { errorResponse } from '../errors.js';

export const monitor = new Hono();

monitor.get('/overview', (c) => c.json(overview()));
monitor.get('/queue', (c) => c.json(queue()));
monitor.get('/robots', (c) => c.json({ robots: monitorRobots() }));

monitor.get('/alerts', (c) => {
  const resolvedParam = c.req.query('resolved');
  let resolved: boolean | null = false; // 默认未解决
  if (resolvedParam === 'true') resolved = true;
  else if (resolvedParam === 'false') resolved = false;
  else if (resolvedParam === 'all' || resolvedParam === '*') resolved = null;
  return c.json({ alerts: monitorAlerts(resolved) });
});

monitor.post('/alerts/:id/resolve', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return errorResponse(c, 'INTERNAL_ERROR', 'invalid alert id');
  try {
    return c.json(resolveAlert(id));
  } catch (e) {
    return errorResponse(c, 'INTERNAL_ERROR', (e as Error).message);
  }
});

monitor.post('/alerts/test', (c) => {
  // 仅用于验证 SSE 告警通道（开发自检），不在契约中
  const alert = createAlert('robot_offline', 'SSE 通道自检', null);
  return c.json(alert, 201);
});

monitor.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    let stopped = false;
    const queueEvents: { event: string; data: string }[] = [];
    const unsub = subscribe((event, payload) => {
      queueEvents.push({ event, data: payload });
    });

    const onAbort = () => {
      stopped = true;
    };
    stream.onAbort(onAbort);

    try {
      // 初始连接确认
      await stream.writeSSE({ event: 'connected', data: String(Date.now()) });
      let lastHeartbeat = Date.now();
      while (!stopped) {
        if (queueEvents.length) {
          while (queueEvents.length) {
            const m = queueEvents.shift()!;
            await stream.writeSSE(m);
          }
          lastHeartbeat = Date.now();
        } else {
          await new Promise((r) => setTimeout(r, 200));
          if (Date.now() - lastHeartbeat > 15000) {
            await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
            lastHeartbeat = Date.now();
          }
        }
      }
    } catch {
      /* 客户端断开 */
    } finally {
      unsub();
    }
  });
});
