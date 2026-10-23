import type { Hono } from 'hono';
import type { AppContext } from '../context';
import { BusinessError } from '../modules/device-management';

/**
 * Registers all REST API routes on the Hono app.
 * Routes are grouped by domain module.
 */
export function registerRoutes(app: Hono, ctx: AppContext): void {
  // --- Task Management (7 endpoints) ---

  // POST /api/tasks — create task
  app.post('/api/tasks', async (c) => {
    try {
      const body = await c.req.json();
      const task = ctx.task.createTask({
        sourceLocationCode: body.sourceLocationCode,
        targetLocationCode: body.targetLocationCode,
        cargoName: body.cargoName,
        cargoQuantity: body.cargoQuantity,
        priority: body.priority,
        remark: body.remark,
        createdBy: body.createdBy,
        autoAssign: body.autoAssign ?? false,
      });
      return c.json(task, 201);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // GET /api/tasks — list tasks with filters
  app.get('/api/tasks', (c) => {
    try {
      const result = ctx.task.getTasks({
        status: c.req.query('status'),
        priority: c.req.query('priority'),
        resourceId: c.req.query('resourceId') ? parseInt(c.req.query('resourceId')!, 10) : undefined,
        page: c.req.query('page') ? parseInt(c.req.query('page')!, 10) : undefined,
        pageSize: c.req.query('pageSize') ? parseInt(c.req.query('pageSize')!, 10) : undefined,
      });
      return c.json(result, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // GET /api/tasks/:id — task detail
  app.get('/api/tasks/:id', (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } }, 400);
      const task = ctx.task.getTaskDetail(id);
      if (!task) return c.json({ error: { code: 'NOT_FOUND', message: `Task ${id} not found` } }, 404);
      return c.json(task, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // POST /api/tasks/:id/assign — assign task
  app.post('/api/tasks/:id/assign', async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } }, 400);
      const body = await c.req.json();
      const task = ctx.task.assignTask(id, {
        resourceId: body.resourceId,
        autoAssign: body.autoAssign ?? false,
      });
      return c.json(task, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // POST /api/tasks/:id/cancel — cancel task
  app.post('/api/tasks/:id/cancel', async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } }, 400);
      const body = await c.req.json();
      const task = ctx.task.cancelTask(id, {
        cancelledBy: body.cancelledBy,
        confirm: body.confirm ?? false,
      });
      return c.json(task, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // POST /api/tasks/:id/complete — complete task
  app.post('/api/tasks/:id/complete', async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } }, 400);
      const body = await c.req.json();
      const task = ctx.task.completeTask(id, {
        completedBy: body.completedBy,
      });
      return c.json(task, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // POST /api/tasks/:id/recover — recover from error
  app.post('/api/tasks/:id/recover', async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } }, 400);
      const body = await c.req.json();
      const task = ctx.task.recoverTask(id, {
        recoveredBy: body.recoveredBy,
        action: body.action,
      });
      return c.json(task, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // --- Device Management (5 endpoints) ---

  // GET /api/resources — list resources
  app.get('/api/resources', (c) => {
    try {
      const resources = ctx.device.getResources(c.req.query('status') || undefined);
      return c.json({ resources }, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // GET /api/resources/:id — resource detail
  app.get('/api/resources/:id', (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid resource ID' } }, 400);
      const resource = ctx.device.getResourceById(id);
      if (!resource) return c.json({ error: { code: 'NOT_FOUND', message: `Resource ${id} not found` } }, 404);
      return c.json(resource, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // POST /api/resources — create resource
  app.post('/api/resources', async (c) => {
    try {
      const body = await c.req.json();
      const resource = ctx.device.createResource({
        name: body.name,
        type: body.type,
        initialLocationCode: body.initialLocationCode,
      });
      return c.json(resource, 201);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // PATCH /api/resources/:id/status — update status
  app.patch('/api/resources/:id/status', async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid resource ID' } }, 400);
      const body = await c.req.json();
      const resource = ctx.device.updateStatus(id, body.status);
      return c.json(resource, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // POST /api/resources/:id/position — position report
  app.post('/api/resources/:id/position', async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid resource ID' } }, 400);
      const body = await c.req.json();
      const result = ctx.device.reportPosition(id, body.locationCode);
      return c.json(result, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // --- Warehouse Map (2 endpoints) ---

  // GET /api/locations — list locations
  app.get('/api/locations', (c) => {
    try {
      const locations = ctx.map.getLocations();
      return c.json({ locations }, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // GET /api/maps/topology — topology
  app.get('/api/maps/topology', (c) => {
    try {
      const topology = ctx.map.getTopology();
      return c.json(topology, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // --- Path Planning (1 endpoint) ---

  // GET /api/routes/:taskId — get active route
  app.get('/api/routes/:taskId', (c) => {
    try {
      const taskId = parseInt(c.req.param('taskId'), 10);
      if (isNaN(taskId)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } }, 400);
      const route = ctx.path.getActiveRoute(taskId);
      if (!route) return c.json({ error: { code: 'NOT_FOUND', message: `No active route for task ${taskId}` } }, 404);
      return c.json(route, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // --- Traffic Coordination (1 endpoint) ---

  // GET /api/traffic/conflicts — list conflicts
  app.get('/api/traffic/conflicts', (c) => {
    try {
      const conflicts = ctx.traffic.getConflicts(c.req.query('status') || undefined);
      return c.json({ conflicts }, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // --- Execution Monitoring (1 endpoint) ---

  // GET /api/tasks/:id/events — task events
  app.get('/api/tasks/:id/events', (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid task ID' } }, 400);
      const events = ctx.events.getEventsByTaskId(id);
      return c.json({ events }, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // --- Statistics (2 endpoints) ---

  // GET /api/statistics — query statistics
  app.get('/api/statistics', (c) => {
    try {
      const stats = ctx.stats.getStatistics({
        startDate: c.req.query('startDate') || undefined,
        endDate: c.req.query('endDate') || undefined,
        resourceId: c.req.query('resourceId') ? parseInt(c.req.query('resourceId')!, 10) : undefined,
        priority: c.req.query('priority') || undefined,
      });
      return c.json(stats, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // GET /api/statistics/export — export CSV
  app.get('/api/statistics/export', (c) => {
    try {
      const csv = ctx.stats.exportCSV({
        startDate: c.req.query('startDate') || undefined,
        endDate: c.req.query('endDate') || undefined,
        resourceId: c.req.query('resourceId') ? parseInt(c.req.query('resourceId')!, 10) : undefined,
        priority: c.req.query('priority') || undefined,
      });
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', 'attachment; filename="task-statistics.csv"');
      return c.body(csv, 200);
    } catch (err) {
      return handleError(c, err);
    }
  });

  // --- Health check ---
  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }, 200));
}

import type { Context } from 'hono';

function handleError(c: Context, err: unknown): Response {
  if (err instanceof BusinessError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as any);
  }
  console.error('[api] Unhandled error:', err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
}
