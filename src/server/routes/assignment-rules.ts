import { Hono } from 'hono';
import type { AppEnv } from '../middleware/session.js';
import { requireAuth } from '../middleware/session.js';
import { requireOperator, assertCapability } from '../access-control.js';
import * as assignmentService from '../services/assignment.js';

export const assignmentRuleRoutes = new Hono<AppEnv>();

assignmentRuleRoutes.use('*', requireAuth());

// GET /api/assignment-rules
assignmentRuleRoutes.get('/', (c) => {
  const operator = requireOperator(c.get('operator'));
  const result = assignmentService.listAssignmentRules(operator);
  return c.json(result);
});

// POST /api/assignment-rules
assignmentRuleRoutes.post('/', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'configure_assignment');
  const body = await c.req.json();

  if (typeof body?.category !== 'string' || body.category.length === 0) {
    throw new (await import('../errors.js')).AppError('VALIDATION_FAILED', 'category 为必填', { fields: { category: ['required'] } });
  }
  if (typeof body?.groupId !== 'string' || body.groupId.length === 0) {
    throw new (await import('../errors.js')).AppError('VALIDATION_FAILED', 'groupId 为必填', { fields: { groupId: ['required'] } });
  }

  const rule = assignmentService.createAssignmentRule(operator, {
    category: body.category,
    groupId: body.groupId,
    enabled: body.enabled !== false, // default true
  });
  return c.json({ rule }, 201);
});

// PUT /api/assignment-rules/:id
assignmentRuleRoutes.put('/:id', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'configure_assignment');
  const ruleId = c.req.param('id');
  const body = await c.req.json();

  const rule = assignmentService.updateAssignmentRule(operator, ruleId, {
    groupId: typeof body?.groupId === 'string' ? body.groupId : undefined,
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
  });
  return c.json({ rule }, 200);
});
