import { getDb } from './db.js';
import { appendLog } from './services/ticket.js';

export function seedIfEmpty(): void {
  const db = getDb();

  const companyCount = db.prepare('SELECT COUNT(*) as cnt FROM company').get() as { cnt: number };
  if (companyCount.cnt > 0) return;

  const now = new Date().toISOString();

  // ---- Companies ----
  const companies = [
    { id: 'c1', name: 'Acme' },
    { id: 'c2', name: 'Beta Corp' },
  ];

  // ---- Users ----
  const users = [
    // Acme
    { id: 'u1', name: '张伟', email: 'zhangwei@acme.com', company_id: 'c1', department: '研发部', role: 'admin' },
    { id: 'u2', name: '李娜', email: 'lina@acme.com', company_id: 'c1', department: '财务部', role: 'submitter' },
    { id: 'u3', name: '王强', email: 'wangqiang@acme.com', company_id: 'c1', department: 'IT部', role: 'handler' },
    { id: 'u4', name: '赵敏', email: 'zhaomin@acme.com', company_id: 'c1', department: 'IT部', role: 'handler' },
    { id: 'u5', name: '陈刚', email: 'chengang@acme.com', company_id: 'c1', department: '市场部', role: 'submitter' },
    // Beta
    { id: 'u6', name: '刘洋', email: 'liuyang@beta.com', company_id: 'c2', department: '技术部', role: 'admin' },
    { id: 'u7', name: '周梅', email: 'zhoumei@beta.com', company_id: 'c2', department: '人事部', role: 'submitter' },
    { id: 'u8', name: '孙杰', email: 'sunjie@beta.com', company_id: 'c2', department: '运维部', role: 'handler' },
  ];

  // ---- Business Groups ----
  const groups = [
    { id: 'g1', company_id: 'c1', name: 'IT支持组' },
    { id: 'g2', company_id: 'c1', name: '财务支持组' },
    { id: 'g3', company_id: 'c2', name: '运维支持组' },
  ];

  // ---- Group Members ----
  const groupMembers = [
    { group_id: 'g1', user_id: 'u3' },
    { group_id: 'g1', user_id: 'u4' },
    { group_id: 'g2', user_id: 'u1' },
    { group_id: 'g3', user_id: 'u8' },
  ];

  // ---- Assignment Rules ----
  const rules = [
    { id: 'r1', company_id: 'c1', category: '硬件故障', group_id: 'g1', enabled: 1 },
    { id: 'r2', company_id: 'c1', category: '网络', group_id: 'g1', enabled: 1 },
    { id: 'r3', company_id: 'c2', category: '网络', group_id: 'g3', enabled: 1 },
  ];

  // ---- Sample Tickets ----
  const baseTime = '2026-10-20T09:00:00.000Z';

  const tickets = [
    // Acme - ticket 1: hardware, auto-assigned to g1, pending_handling
    {
      id: 'tk_000001', company_id: 'c1', subject: '打印机无法连接', description: '三楼打印机无法连接到网络，需要协助。',
      category: '硬件故障', priority: 'P2', status: 'pending_handling',
      submitter_id: 'u2', created_at: baseTime,
      group_id: 'g1', assigned_at: '2026-10-20T09:00:00.200Z', assigned_mode: 'auto', assignee_id: null,
    },
    // Acme - ticket 2: network, auto-assigned to g1, pending_handling
    {
      id: 'tk_000002', company_id: 'c1', subject: '办公网络中断', description: '五楼办公区域网络完全中断。',
      category: '网络', priority: 'P1', status: 'pending_handling',
      submitter_id: 'u5', created_at: '2026-10-20T10:30:00.000Z',
      group_id: 'g1', assigned_at: '2026-10-20T10:30:00.200Z', assigned_mode: 'auto', assignee_id: 'u4',
    },
    // Acme - ticket 3: software, no rule, pending_assignment
    {
      id: 'tk_000003', company_id: 'c1', subject: 'ERP系统登录失败', description: '多个用户报告ERP系统无法登录。',
      category: '软件', priority: 'P3', status: 'pending_assignment',
      submitter_id: 'u2', created_at: '2026-10-20T11:00:00.000Z',
      group_id: null, assigned_at: null, assigned_mode: null, assignee_id: null,
    },
    // Acme - ticket 4: hardware, completed by u3, rated 5
    {
      id: 'tk_000004', company_id: 'c1', subject: '显示器闪烁', description: '工位显示器频繁闪烁，影响工作。',
      category: '硬件故障', priority: 'P2', status: 'completed',
      submitter_id: 'u5', created_at: '2026-10-19T08:00:00.000Z',
      group_id: 'g1', assigned_at: '2026-10-19T08:00:00.200Z', assigned_mode: 'auto', assignee_id: 'u3',
      handler_id: 'u3', handled_at: '2026-10-19T09:30:00.000Z', resolution: '更换了显示器连接线，问题已解决。',
    },
    // Acme - ticket 5: network, cancelled
    {
      id: 'tk_000005', company_id: 'c1', subject: 'VPN连接不稳定', description: '远程办公时VPN频繁断开。',
      category: '网络', priority: 'P4', status: 'cancelled',
      submitter_id: 'u2', created_at: '2026-10-18T14:00:00.000Z',
      group_id: 'g1', assigned_at: '2026-10-18T14:00:00.200Z', assigned_mode: 'auto', assignee_id: 'u4',
      cancelled_at: '2026-10-18T16:00:00.000Z', cancel_reason: '问题自行解决',
    },
    // Beta - ticket 6: network, auto-assigned to g3
    {
      id: 'tk_000006', company_id: 'c2', subject: '服务器网络异常', description: '内部服务器网络连接不稳定。',
      category: '网络', priority: 'P2', status: 'pending_handling',
      submitter_id: 'u7', created_at: '2026-10-20T09:15:00.000Z',
      group_id: 'g3', assigned_at: '2026-10-20T09:15:00.200Z', assigned_mode: 'auto', assignee_id: 'u8',
    },
  ];

  // ---- Replies ----
  const replies = [
    // tk_000004: handler reply + submitter reply
    { id: 'rp_1', ticket_id: 'tk_000004', author_id: 'u3', author_role: 'handler', content: '已检查显示器连接线，发现线缆老化，正在更换。', created_at: '2026-10-19T08:30:00.000Z' },
    { id: 'rp_2', ticket_id: 'tk_000004', author_id: 'u5', author_role: 'submitter', content: '收到，谢谢。', created_at: '2026-10-19T09:00:00.000Z' },
  ];

  // ---- Transfers ----
  const transfers = [
    // tk_000002: transferred from u3 to u4 within g1
    { id: 'tf_1', ticket_id: 'tk_000002', from_group_id: 'g1', from_user_id: null, to_group_id: 'g1', to_user_id: 'u4', transferred_by: 'u3', transferred_at: '2026-10-20T11:00:00.000Z', note: '转派给赵敏处理' },
  ];

  // ---- Ratings ----
  const ratings = [
    { id: 'rt_1', ticket_id: 'tk_000004', rated_by: 'u5', score: 5, rated_at: '2026-10-19T10:00:00.000Z' },
  ];

  // ---- Email Outbox ----
  const notifications = [
    { id: 'em_1', ticket_id: 'tk_000004', to_email: 'chengang@acme.com', subject: '工单 tk_000004 已完成', status: 'sent', created_at: '2026-10-19T09:30:00.000Z', sent_at: '2026-10-19T09:30:00.100Z', error: null },
  ];

  // ---- Operation Logs ----
  const logs = [
    // tk_000001
    { id: 'lg_1', ticket_id: 'tk_000001', action: 'ticket_created', actor_id: 'u2', created_at: '2026-10-20T09:00:00.000Z', detail: '{"category":"硬件故障","priority":"P2"}' },
    { id: 'lg_2', ticket_id: 'tk_000001', action: 'ticket_assigned', actor_id: 'u2', created_at: '2026-10-20T09:00:00.200Z', detail: '{"groupId":"g1","mode":"auto"}' },
    // tk_000002
    { id: 'lg_3', ticket_id: 'tk_000002', action: 'ticket_created', actor_id: 'u5', created_at: '2026-10-20T10:30:00.000Z', detail: '{"category":"网络","priority":"P1"}' },
    { id: 'lg_4', ticket_id: 'tk_000002', action: 'ticket_assigned', actor_id: 'u5', created_at: '2026-10-20T10:30:00.200Z', detail: '{"groupId":"g1","mode":"auto"}' },
    { id: 'lg_5', ticket_id: 'tk_000002', action: 'ticket_transferred', actor_id: 'u3', created_at: '2026-10-20T11:00:00.000Z', detail: '{"fromGroupId":"g1","toGroupId":"g1","toUserId":"u4"}' },
    // tk_000003
    { id: 'lg_6', ticket_id: 'tk_000003', action: 'ticket_created', actor_id: 'u2', created_at: '2026-10-20T11:00:00.000Z', detail: '{"category":"软件","priority":"P3"}' },
    // tk_000004
    { id: 'lg_7', ticket_id: 'tk_000004', action: 'ticket_created', actor_id: 'u5', created_at: '2026-10-19T08:00:00.000Z', detail: '{"category":"硬件故障","priority":"P2"}' },
    { id: 'lg_8', ticket_id: 'tk_000004', action: 'ticket_assigned', actor_id: 'u5', created_at: '2026-10-19T08:00:00.200Z', detail: '{"groupId":"g1","mode":"auto"}' },
    { id: 'lg_9', ticket_id: 'tk_000004', action: 'ticket_replied', actor_id: 'u3', created_at: '2026-10-19T08:30:00.000Z', detail: '{"authorRole":"handler"}' },
    { id: 'lg_10', ticket_id: 'tk_000004', action: 'ticket_replied', actor_id: 'u5', created_at: '2026-10-19T09:00:00.000Z', detail: '{"authorRole":"submitter"}' },
    { id: 'lg_11', ticket_id: 'tk_000004', action: 'ticket_status_changed', actor_id: 'u3', created_at: '2026-10-19T09:30:00.000Z', detail: '{"from":"pending_handling","to":"completed"}' },
    { id: 'lg_12', ticket_id: 'tk_000004', action: 'ticket_completed', actor_id: 'u3', created_at: '2026-10-19T09:30:00.000Z', detail: '{"resolution":"更换了显示器连接线，问题已解决。"}' },
    { id: 'lg_13', ticket_id: 'tk_000004', action: 'rating_submitted', actor_id: 'u5', created_at: '2026-10-19T10:00:00.000Z', detail: '{"score":5}' },
    // tk_000005
    { id: 'lg_14', ticket_id: 'tk_000005', action: 'ticket_created', actor_id: 'u2', created_at: '2026-10-18T14:00:00.000Z', detail: '{"category":"网络","priority":"P4"}' },
    { id: 'lg_15', ticket_id: 'tk_000005', action: 'ticket_assigned', actor_id: 'u2', created_at: '2026-10-18T14:00:00.200Z', detail: '{"groupId":"g1","mode":"auto"}' },
    { id: 'lg_16', ticket_id: 'tk_000005', action: 'ticket_cancelled', actor_id: 'u2', created_at: '2026-10-18T16:00:00.000Z', detail: '{"reason":"问题自行解决"}' },
    { id: 'lg_17', ticket_id: 'tk_000005', action: 'ticket_status_changed', actor_id: 'u2', created_at: '2026-10-18T16:00:00.000Z', detail: '{"from":"pending_handling","to":"cancelled"}' },
    // tk_000006
    { id: 'lg_18', ticket_id: 'tk_000006', action: 'ticket_created', actor_id: 'u7', created_at: '2026-10-20T09:15:00.000Z', detail: '{"category":"网络","priority":"P2"}' },
    { id: 'lg_19', ticket_id: 'tk_000006', action: 'ticket_assigned', actor_id: 'u7', created_at: '2026-10-20T09:15:00.200Z', detail: '{"groupId":"g3","mode":"auto"}' },
  ];

  // ---- Insert all data in a transaction ----
  const tx = db.transaction(() => {
    for (const c of companies) {
      db.prepare('INSERT INTO company (id, name) VALUES (?, ?)').run(c.id, c.name);
    }
    for (const u of users) {
      db.prepare('INSERT INTO app_user (id, name, email, company_id, department, role) VALUES (?, ?, ?, ?, ?, ?)')
        .run(u.id, u.name, u.email, u.company_id, u.department, u.role);
    }
    for (const g of groups) {
      db.prepare('INSERT INTO business_group (id, company_id, name) VALUES (?, ?, ?)').run(g.id, g.company_id, g.name);
    }
    for (const m of groupMembers) {
      db.prepare('INSERT INTO business_group_member (group_id, user_id) VALUES (?, ?)').run(m.group_id, m.user_id);
    }
    for (const r of rules) {
      db.prepare('INSERT INTO assignment_rule (id, company_id, category, group_id, enabled) VALUES (?, ?, ?, ?, ?)')
        .run(r.id, r.company_id, r.category, r.group_id, r.enabled);
    }
    for (const t of tickets) {
      db.prepare(`
        INSERT INTO ticket (id, company_id, subject, description, category, priority, status,
          submitter_id, created_at, group_id, assigned_at, assigned_mode, assignee_id,
          handler_id, handled_at, cancelled_at, resolution, cancel_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        t.id, t.company_id, t.subject, t.description, t.category, t.priority, t.status,
        t.submitter_id, t.created_at, t.group_id, t.assigned_at, t.assigned_mode, t.assignee_id,
        t.handler_id ?? null, t.handled_at ?? null, t.cancelled_at ?? null, t.resolution ?? null, t.cancel_reason ?? null
      );
    }
    for (const r of replies) {
      db.prepare('INSERT INTO ticket_reply (id, ticket_id, author_id, author_role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(r.id, r.ticket_id, r.author_id, r.author_role, r.content, r.created_at);
    }
    for (const t of transfers) {
      db.prepare('INSERT INTO ticket_transfer (id, ticket_id, from_group_id, from_user_id, to_group_id, to_user_id, transferred_by, transferred_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(t.id, t.ticket_id, t.from_group_id, t.from_user_id, t.to_group_id, t.to_user_id, t.transferred_by, t.transferred_at, t.note);
    }
    for (const r of ratings) {
      db.prepare('INSERT INTO ticket_rating (id, ticket_id, rated_by, score, rated_at) VALUES (?, ?, ?, ?, ?)')
        .run(r.id, r.ticket_id, r.rated_by, r.score, r.rated_at);
    }
    for (const n of notifications) {
      db.prepare('INSERT INTO email_outbox (id, ticket_id, to_email, subject, status, created_at, sent_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(n.id, n.ticket_id, n.to_email, n.subject, n.status, n.created_at, n.sent_at, n.error);
    }
    for (const l of logs) {
      db.prepare('INSERT INTO operation_log (id, ticket_id, action, actor_id, created_at, detail) VALUES (?, ?, ?, ?, ?, ?)')
        .run(l.id, l.ticket_id, l.action, l.actor_id, l.created_at, l.detail);
    }
  });
  tx();
}
