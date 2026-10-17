import {
  conflict,
  forbidden,
  invalidState,
  notFound,
  validationError,
} from './errors.js';
import { isCompanyAdmin, isMemberOfCompanyGroup, getUserRow } from './users.js';
import { getTicketRow, mapTicketRow, ticketDetail, listTicketRows } from './serialize.js';

/**
 * 工单领域服务（src/domain/，架构基线 2.2 状态机）。
 * 服务端唯一状态机执行者：状态变更 + 事件写入 + 关联字段更新在同一事务内完成。
 */

const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const TERMINAL_STATUSES = ['completed', 'cancelled'];
const ISO = () => new Date().toISOString();

function insertEvent(db, { ticketId, type, actorId, detail = {}, createdAt }) {
  db.prepare(
    `INSERT INTO ticket_events (ticket_id, type, actor_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(ticketId, type, actorId, JSON.stringify(detail), createdAt);
}

function groupRef(db, groupId) {
  return db
    .prepare('SELECT id, name FROM business_groups WHERE id = ?')
    .get(groupId);
}

function userRef(db, userId) {
  return db
    .prepare('SELECT id, name FROM users WHERE id = ?')
    .get(userId);
}

/** 组内第一位成员（按用户 id 升序，契约 3.2/3.7 默认规则）；空组返回 null */
export function firstGroupMember(db, groupId) {
  const row = db
    .prepare(
      `SELECT gm.user_id AS id, u.name AS name
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.user_id ASC
       LIMIT 1`,
    )
    .get(groupId);
  return row ?? null;
}

export function assertValidPriority(priority) {
  if (!PRIORITIES.includes(priority)) {
    throw validationError('priority 必须为 P0–P4 枚举值');
  }
}

/** 路径工单参数解析：不存在 → 404 */
export function loadTicket(db, ticketId) {
  const row = getTicketRow(db, ticketId);
  if (!row) throw notFound('工单不存在');
  return { raw: row, ticket: mapTicketRow(row) };
}

/* ------------------------------------------------------------------ */
/* 创建（契约 3.2）：未命中规则停留 created；命中规则同事务直达 processing */
/* ------------------------------------------------------------------ */
export function createTicket(db, { submitter, subject, description, categoryId, priority }) {
  assertValidPriority(priority);
  const category = db
    .prepare('SELECT id, name FROM categories WHERE id = ?')
    .get(categoryId);
  if (!category) throw validationError('categoryId 必须存在于分类列表');

  // submitter 兼容 API 序列化 User（company.id）与 DB 行（company_id）两种形态
  const companyId = submitter.company?.id ?? submitter.company_id;
  const now = ISO();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO tickets (ticket_no, subject, description, category_id, priority,
                              status, submitter_id, assigned_group_id, assignee_id,
                              created_at, updated_at, completed_at, completed_by)
         VALUES ('', ?, ?, ?, ?, 'created', ?, NULL, NULL, ?, ?, NULL, NULL)`,
      )
      .run(subject, description ?? '', categoryId, priority, submitter.id, now, now);
    const ticketId = Number(info.lastInsertRowid);
    const ticketNo = `TK-${String(ticketId).padStart(4, '0')}`;
    db.prepare('UPDATE tickets SET ticket_no = ? WHERE id = ?').run(ticketNo, ticketId);

    insertEvent(db, {
      ticketId,
      type: 'created',
      actorId: submitter.id,
      detail: {},
      createdAt: now,
    });

    // 分类自动分配规则匹配（公司级“分类→业务组”）
    const rule = db
      .prepare(
        'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
      )
      .get(companyId, categoryId);

    if (rule) {
      const assignee = firstGroupMember(db, rule.group_id);
      db.prepare(
        `UPDATE tickets SET status = 'processing', assigned_group_id = ?, assignee_id = ?, updated_at = ?
         WHERE id = ?`,
      ).run(rule.group_id, assignee ? assignee.id : null, ISO(), ticketId);

      insertEvent(db, {
        ticketId,
        type: 'dispatched',
        actorId: submitter.id,
        detail: {},
        createdAt: ISO(),
      });
      insertEvent(db, {
        ticketId,
        type: 'assigned',
        actorId: submitter.id,
        detail: {
          group: groupRef(db, rule.group_id),
          assignee,
          previousAssignee: null,
        },
        createdAt: ISO(),
      });
    }

    return ticketId;
  });

  const ticketId = tx();
  return ticketDetail(db, ticketId);
}

/* ------------------------------------------------------------------ */
/* dispatch（契约 3.6）：created → pending_assignment                    */
/* ------------------------------------------------------------------ */
const DISPATCH_ROLES = '提交人、该公司管理员或该公司任意业务组成员';

function assertCanDispatch(db, actor, ticket) {
  const companyId = ticket.submitter.company.id;
  if (ticket.submitter.id === actor.id) return;
  if (isCompanyAdmin(actor, companyId)) return;
  if (isMemberOfCompanyGroup(db, actor.id, companyId)) return;
  throw forbidden(`仅${DISPATCH_ROLES}可执行分配流程操作`);
}

export function dispatchTicket(db, { actor, ticket }) {
  if (ticket.status !== 'created') {
    throw invalidState('仅 created 状态的工单可进入分配流程');
  }
  assertCanDispatch(db, actor, ticket);

  const now = ISO();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE tickets SET status = 'pending_assignment', updated_at = ? WHERE id = ?`,
    ).run(now, ticket.id);
    insertEvent(db, {
      ticketId: ticket.id,
      type: 'dispatched',
      actorId: actor.id,
      detail: {},
      createdAt: now,
    });
  });
  tx();
  return ticketDetail(db, ticket.id);
}

/* ------------------------------------------------------------------ */
/* assign（契约 3.7）：created|pending_assignment → processing           */
/* ------------------------------------------------------------------ */
function assertCanAssign(db, actor, ticket) {
  const companyId = ticket.submitter.company.id;
  if (isCompanyAdmin(actor, companyId)) return;
  if (isMemberOfCompanyGroup(db, actor.id, companyId)) return;
  throw forbidden('仅该公司管理员或该公司任意业务组成员可指派工单');
}

function resolveAssignment(db, { ticket, groupId, assigneeId }) {
  const group = db
    .prepare('SELECT id, name, company_id FROM business_groups WHERE id = ?')
    .get(groupId);
  if (!group || group.company_id !== ticket.submitter.company.id) {
    throw validationError('业务组不存在或不属于工单提交人的公司');
  }

  let assignee = null;
  if (assigneeId !== null && assigneeId !== undefined) {
    const member = db
      .prepare('SELECT u.id, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND gm.user_id = ?')
      .get(groupId, assigneeId);
    if (!member) throw validationError('assigneeId 必须是该业务组成员');
    assignee = { id: member.id, name: member.name };
  } else {
    assignee = firstGroupMember(db, groupId);
  }
  return { group: { id: group.id, name: group.name }, assignee };
}

export function assignTicket(db, { actor, ticket, groupId, assigneeId }) {
  if (ticket.status !== 'created' && ticket.status !== 'pending_assignment') {
    throw invalidState('仅 created 或 pending_assignment 状态的工单可指派');
  }
  assertCanAssign(db, actor, ticket);

  const target = resolveAssignment(db, { ticket, groupId, assigneeId });
  const now = ISO();

  const tx = db.transaction(() => {
    // created 起点时先内部流转 dispatched，再指派（契约 3.7）
    if (ticket.status === 'created') {
      insertEvent(db, {
        ticketId: ticket.id,
        type: 'dispatched',
        actorId: actor.id,
        detail: {},
        createdAt: now,
      });
    }
    db.prepare(
      `UPDATE tickets SET status = 'processing', assigned_group_id = ?, assignee_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(target.group.id, target.assignee ? target.assignee.id : null, now, ticket.id);
    insertEvent(db, {
      ticketId: ticket.id,
      type: 'assigned',
      actorId: actor.id,
      detail: {
        group: target.group,
        assignee: target.assignee,
        previousAssignee: ticket.assignee,
      },
      createdAt: now,
    });
  });
  tx();
  return ticketDetail(db, ticket.id);
}

/* ------------------------------------------------------------------ */
/* replies（契约 3.8）：提交人或当前处理人；任意状态可回复；不产生事件    */
/* ------------------------------------------------------------------ */
export function assertCanReply(actor, ticket) {
  if (ticket.submitter.id === actor.id) return;
  if (ticket.assignee && ticket.assignee.id === actor.id) return;
  throw forbidden('仅工单提交人或当前处理人可回复');
}

export function addReply(db, { actor, ticket, content }) {
  assertCanReply(actor, ticket);
  const now = ISO();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO ticket_replies (ticket_id, author_id, content, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(ticket.id, actor.id, content, now);
    db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now, ticket.id);
    const replyRow = db
      .prepare(
        `SELECT r.id, r.author_id, u.name AS author_name, r.content, r.created_at
         FROM ticket_replies r JOIN users u ON u.id = r.author_id WHERE r.id = ?`,
      )
      .get(Number(info.lastInsertRowid));
    return {
      reply: {
        id: replyRow.id,
        author: { id: replyRow.author_id, name: replyRow.author_name },
        content: replyRow.content,
        createdAt: replyRow.created_at,
      },
    };
  });
  const { reply } = tx();
  return { reply, ticket: ticketDetail(db, ticket.id) };
}

/* ------------------------------------------------------------------ */
/* reassign（契约 3.9）：processing 内变更处理方，保持 processing         */
/* ------------------------------------------------------------------ */
function assertCanManageProcessing(db, actor, ticket) {
  const companyId = ticket.submitter.company.id;
  if (ticket.assignee && ticket.assignee.id === actor.id) return;
  if (isCompanyAdmin(actor, companyId)) return;
  throw forbidden('仅当前处理人或该公司管理员可执行该操作');
}

export function reassignTicket(db, { actor, ticket, groupId, assigneeId }) {
  if (ticket.status !== 'processing') {
    throw invalidState('仅 processing 状态的工单可转派');
  }
  assertCanManageProcessing(db, actor, ticket);

  const target = resolveAssignment(db, { ticket, groupId, assigneeId });
  const now = ISO();

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE tickets SET assigned_group_id = ?, assignee_id = ?, updated_at = ? WHERE id = ?`,
    ).run(target.group.id, target.assignee ? target.assignee.id : null, now, ticket.id);
    insertEvent(db, {
      ticketId: ticket.id,
      type: 'reassigned',
      actorId: actor.id,
      detail: {
        group: target.group,
        assignee: target.assignee,
        previousAssignee: ticket.assignee,
      },
      createdAt: now,
    });
  });
  tx();
  return ticketDetail(db, ticket.id);
}

/* ------------------------------------------------------------------ */
/* complete（契约 3.10）：processing → completed，记录处理人与时间        */
/* ------------------------------------------------------------------ */
export function completeTicket(db, { actor, ticket, note }) {
  if (ticket.status !== 'processing') {
    throw invalidState('仅 processing 状态的工单可完成处理');
  }
  assertCanManageProcessing(db, actor, ticket);

  const now = ISO();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE tickets SET status = 'completed', completed_at = ?, completed_by = ?, updated_at = ?
       WHERE id = ?`,
    ).run(now, actor.id, now, ticket.id);
    insertEvent(db, {
      ticketId: ticket.id,
      type: 'completed',
      actorId: actor.id,
      detail: note ? { note } : {},
      createdAt: now,
    });
  });
  tx();
  return ticketDetail(db, ticket.id);
}

/* ------------------------------------------------------------------ */
/* cancel（契约 3.11）：非终态 → cancelled；提交人或当前处理人           */
/* ------------------------------------------------------------------ */
export function cancelTicket(db, { actor, ticket, reason }) {
  if (TERMINAL_STATUSES.includes(ticket.status)) {
    throw invalidState('工单已处于终态，不可取消');
  }
  if (ticket.submitter.id !== actor.id && !(ticket.assignee && ticket.assignee.id === actor.id)) {
    throw forbidden('仅工单提交人或当前处理人可取消工单');
  }

  const now = ISO();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE tickets SET status = 'cancelled', updated_at = ? WHERE id = ?`,
    ).run(now, ticket.id);
    insertEvent(db, {
      ticketId: ticket.id,
      type: 'cancelled',
      actorId: actor.id,
      detail: { reason: reason ?? null },
      createdAt: now,
    });
  });
  tx();
  return ticketDetail(db, ticket.id);
}

/* ------------------------------------------------------------------ */
/* rating（契约 3.12）：completed 后提交人评分 1–5，每工单一次           */
/* ------------------------------------------------------------------ */
export function rateTicket(db, { actor, ticket, score, comment }) {
  if (ticket.status !== 'completed') {
    throw invalidState('仅 completed 状态的工单可评价');
  }
  if (ticket.submitter.id !== actor.id) {
    throw forbidden('仅该工单提交人可评价');
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw validationError('score 必须为 1–5 的整数');
  }
  const existing = db
    .prepare('SELECT ticket_id FROM satisfaction_ratings WHERE ticket_id = ?')
    .get(ticket.id);
  if (existing) throw conflict('该工单已评价，每工单仅可评价一次');

  const now = ISO();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO satisfaction_ratings (ticket_id, score, comment, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(ticket.id, score, comment ?? null, now);
    insertEvent(db, {
      ticketId: ticket.id,
      type: 'rated',
      actorId: actor.id,
      detail: {},
      createdAt: now,
    });
  });
  tx();
  return { score, comment: comment ?? null, createdAt: now };
}

/* ------------------------------------------------------------------ */
/* 列表（契约 3.4）与历史工单（契约 3.5）                                */
/* ------------------------------------------------------------------ */
const TICKET_STATUSES = [
  'created',
  'pending_assignment',
  'processing',
  'completed',
  'cancelled',
];

export function assertValidStatusFilter(status) {
  if (!TICKET_STATUSES.includes(status)) {
    throw validationError('status 筛选值必须是工单状态枚举');
  }
}

export function listTickets(db, { status, categoryId, companyId, submitterId }) {
  const where = [];
  const params = [];
  if (status !== undefined) {
    assertValidStatusFilter(status);
    where.push('t.status = ?');
    params.push(status);
  }
  if (categoryId !== undefined) {
    where.push('t.category_id = ?');
    params.push(categoryId);
  }
  if (companyId !== undefined) {
    where.push('su.company_id = ?');
    params.push(companyId);
  }
  if (submitterId !== undefined) {
    where.push('t.submitter_id = ?');
    params.push(submitterId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return listTicketRows(db, whereSql, params).map(mapTicketRow);
}

export function listUserTickets(db, userId) {
  const user = getUserRow(db, userId);
  if (!user) throw notFound('用户不存在');
  return listTicketRows(db, 'WHERE t.submitter_id = ?', [userId]).map(mapTicketRow);
}
