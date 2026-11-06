import { Hono } from 'hono';
import type { VisitorService } from '../services/visitor-service';
import {
  validateVisitorInput,
  validateStatusUpdate,
  validateListQuery,
} from '../utils/validate';
import { errorResponse } from '../utils/error';

/**
 * 访客登记路由：POST 创建、GET 列表、GET 详情、PATCH 状态更新。
 */
export function createVisitorsRouter(service: VisitorService): Hono {
  const app = new Hono();

  // POST /api/visitors — 提交访客登记
  app.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '请求体必须是合法 JSON');
    }

    const result = validateVisitorInput(body);
    if (!result.ok) {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '字段校验失败', result.fields);
    }

    const visitor = service.create(result.data);
    return c.json(visitor, 201);
  });

  // GET /api/visitors — 查询登记列表（支持 status / phone 过滤）
  app.get('/', (c) => {
    const query: { status?: string; phone?: string } = {};
    const status = c.req.query('status');
    const phone = c.req.query('phone');
    if (status) query.status = status;
    if (phone) query.phone = phone;

    const result = validateListQuery(query);
    if (!result.ok) {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '查询参数校验失败', result.fields);
    }

    const { data, total } = service.list(result.data);
    return c.json({ data, total });
  });

  // GET /api/visitors/:id — 获取登记详情
  app.get('/:id', (c) => {
    const id = c.req.param('id');
    const visitor = service.getById(id);
    if (!visitor) {
      return errorResponse(c, 404, 'NOT_FOUND', '访客登记记录不存在');
    }
    return c.json(visitor);
  });

  // PATCH /api/visitors/:id/status — 更新审核状态
  app.patch('/:id/status', async (c) => {
    const id = c.req.param('id');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '请求体必须是合法 JSON');
    }

    const result = validateStatusUpdate(body);
    if (!result.ok) {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '字段校验失败', result.fields);
    }

    const updateResult = service.updateStatus(id, result.data.status);
    if (!updateResult.ok) {
      if (updateResult.code === 'NOT_FOUND') {
        return errorResponse(c, 404, 'NOT_FOUND', '访客登记记录不存在');
      }
      return errorResponse(
        c,
        409,
        'INVALID_STATE_TRANSITION',
        '当前状态不允许转换，终态记录不可再变更',
      );
    }

    return c.json(updateResult.visitor);
  });

  return app;
}
