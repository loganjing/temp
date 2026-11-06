import type { Database as DatabaseType } from 'better-sqlite3';
import { ulid } from 'ulid';
import type { VisitorInput, ListFilters } from '../utils/validate';

export interface Visitor {
  id: string;
  name: string;
  phone: string;
  id_card: string;
  company: string;
  visit_reason: string;
  host_name: string | null;
  expected_arrival_time: string | null;
  phone_source: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type UpdateStatusResult =
  | { ok: true; visitor: Visitor }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATE_TRANSITION' };

/**
 * 访客登记业务逻辑：创建、查询、详情、状态流转。
 */
export class VisitorService {
  constructor(private db: DatabaseType) {}

  /**
   * 创建访客登记记录，状态初始为 pending。
   */
  create(input: VisitorInput): Visitor {
    const now = new Date().toISOString();
    const id = ulid();

    this.db
      .prepare(
        `INSERT INTO visitors
          (id, name, phone, id_card, company, visit_reason, host_name, expected_arrival_time, phone_source, status, created_at, updated_at)
         VALUES
          (@id, @name, @phone, @id_card, @company, @visit_reason, @host_name, @expected_arrival_time, @phone_source, @status, @created_at, @updated_at)`,
      )
      .run({
        id,
        name: input.name,
        phone: input.phone,
        id_card: input.id_card,
        company: input.company,
        visit_reason: input.visit_reason,
        host_name: input.host_name,
        expected_arrival_time: input.expected_arrival_time,
        phone_source: input.phone_source,
        status: 'pending',
        created_at: now,
        updated_at: now,
      });

    return this.getById(id)!;
  }

  /**
   * 查询登记列表，支持 status / phone 过滤。
   */
  list(filters: ListFilters): { data: Visitor[]; total: number } {
    let sql = 'SELECT * FROM visitors';
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (filters.status) {
      conditions.push('status = @status');
      params.status = filters.status;
    }
    if (filters.phone) {
      conditions.push('phone = @phone');
      params.phone = filters.phone;
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const data = this.db.prepare(sql).all(params) as Visitor[];
    return { data, total: data.length };
  }

  /**
   * 获取单条登记详情。
   */
  getById(id: string): Visitor | null {
    const row = this.db
      .prepare('SELECT * FROM visitors WHERE id = ?')
      .get(id) as Visitor | undefined;
    return row ?? null;
  }

  /**
   * 更新审核状态，执行状态机校验：
   * pending → approved/rejected（终态不可变更）。
   */
  updateStatus(id: string, newStatus: 'approved' | 'rejected'): UpdateStatusResult {
    const visitor = this.getById(id);
    if (!visitor) {
      return { ok: false, code: 'NOT_FOUND' };
    }

    if (visitor.status !== 'pending') {
      return { ok: false, code: 'INVALID_STATE_TRANSITION' };
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE visitors SET status = ?, updated_at = ? WHERE id = ?')
      .run(newStatus, now, id);

    return { ok: true, visitor: this.getById(id)! };
  }
}
