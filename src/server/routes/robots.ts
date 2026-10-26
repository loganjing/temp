import { Hono } from 'hono';
import {
  registerRobot,
  listRobots,
  updateRobotStatus,
  arrive,
} from '../services/robot-service.js';
import { errorResponse } from '../errors.js';

export const robots = new Hono();

robots.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 'INVALID_NAME');
  }
  const name = (body as { name?: unknown })?.name;
  try {
    const robot = registerRobot(name);
    return c.json(robot, 201);
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'INTERNAL_ERROR';
    return errorResponse(c, code as never, (e as Error).message);
  }
});

robots.get('/', (c) => {
  return c.json({ robots: listRobots() });
});

robots.patch('/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return errorResponse(c, 'ROBOT_NOT_FOUND');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 'INVALID_STATUS');
  }
  const status = (body as { status?: unknown })?.status;
  try {
    const res = updateRobotStatus(id, status);
    return c.json(res, 200);
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'INTERNAL_ERROR';
    return errorResponse(c, code as never, (e as Error).message);
  }
});

robots.post('/:id/arrive', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return errorResponse(c, 'ROBOT_NOT_FOUND');
  }
  try {
    const res = arrive(id);
    return c.json(res, 200);
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'INTERNAL_ERROR';
    return errorResponse(c, code as never, (e as Error).message);
  }
});
