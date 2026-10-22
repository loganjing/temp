import { Hono } from 'hono';
import type { AppEnv } from '../middleware/session.js';
import { requireAuth } from '../middleware/session.js';
import { requireOperator, assertCapability } from '../access-control.js';
import * as assignmentService from '../services/assignment.js';
import { assertString } from '../errors.js';

export const businessGroupRoutes = new Hono<AppEnv>();

businessGroupRoutes.use('*', requireAuth());

// GET /api/business-groups
businessGroupRoutes.get('/', (c) => {
  const operator = requireOperator(c.get('operator'));
  const result = assignmentService.listBusinessGroups(operator);
  return c.json(result);
});

// POST /api/business-groups
businessGroupRoutes.post('/', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'configure_assignment');
  const body = await c.req.json();
  const name = assertString(body?.name, 'name', { min: 1, max: 64 });
  const group = assignmentService.createBusinessGroup(operator, name);
  return c.json({ group }, 201);
});

// PUT /api/business-groups/:id/members
businessGroupRoutes.put('/:id/members', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'configure_assignment');
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const memberIds = body?.memberIds;
  if (!Array.isArray(memberIds)) {
    throw new (await import('../errors.js')).AppError('VALIDATION_FAILED', 'memberIds 必须为数组', { fields: { memberIds: ['must be array'] } });
  }
  // Validate all are strings
  for (const id of memberIds) {
    if (typeof id !== 'string') {
      throw new (await import('../errors.js')).AppError('VALIDATION_FAILED', 'memberIds 元素必须为字符串', { fields: { memberIds: ['must be string array'] } });
    }
  }
  const group = assignmentService.setGroupMembers(operator, groupId, memberIds);
  return c.json({ group }, 200);
});
