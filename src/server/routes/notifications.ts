import { Hono } from 'hono';
import { listNotifications } from '../services/notification-service.js';

export const notifications = new Hono();

notifications.get('/', (c) => {
  const taskIdParam = c.req.query('taskId');
  let taskId: number | null = null;
  if (taskIdParam !== undefined && taskIdParam !== '') {
    const n = Number(taskIdParam);
    if (Number.isInteger(n)) taskId = n;
  }
  return c.json({ notifications: listNotifications(taskId) });
});
