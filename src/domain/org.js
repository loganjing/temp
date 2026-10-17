import { conflict, notFound, validationError } from './errors.js';
import { serializeUser } from './users.js';

/**
 * 组织配置领域服务（src/domain/，契约第 2 节）：
 * 业务组、成员、分配规则、问题分类。
 * 写操作在事务内完成，保证组-成员覆盖写入的原子性。
 */

const GROUP_SELECT = `
  SELECT g.id, g.company_id, g.name
  FROM business_groups g
`;

export function getCompany(db, companyId) {
  return db.prepare('SELECT id, name FROM companies WHERE id = ?').get(companyId);
}

export function getBusinessGroup(db, groupId) {
  return db.prepare(`${GROUP_SELECT} WHERE g.id = ?`).get(groupId);
}

export function groupMembers(db, groupId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.company_id, c.name AS company_name,
              u.department, u.is_company_admin
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       JOIN companies c ON c.id = u.company_id
       WHERE gm.group_id = ?
       ORDER BY u.id ASC`,
    )
    .all(groupId)
    .map(serializeUser);
}

export function serializeBusinessGroup(db, groupRow) {
  return {
    id: groupRow.id,
    companyId: groupRow.company_id,
    name: groupRow.name,
    members: groupMembers(db, groupRow.id),
  };
}

/** 公司业务组及成员列表（契约 2.4） */
export function listBusinessGroups(db, companyId) {
  const company = getCompany(db, companyId);
  if (!company) throw notFound('公司不存在');
  const groups = db
    .prepare(`${GROUP_SELECT} WHERE g.company_id = ? ORDER BY g.id ASC`)
    .all(companyId);
  return groups.map((g) => serializeBusinessGroup(db, g));
}

/** 新增业务组（契约 2.2）：该公司管理员；公司内同名组 → 409 CONFLICT */
export function createBusinessGroup(db, { company, actor, name }) {
  const trimmed = name;
  const existing = db
    .prepare('SELECT id FROM business_groups WHERE company_id = ? AND name = ?')
    .get(company.id, trimmed);
  if (existing) throw conflict('该公司已存在同名业务组');

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO business_groups (company_id, name) VALUES (?, ?)')
      .run(company.id, trimmed);
    return db
      .prepare('SELECT id, company_id, name FROM business_groups WHERE id = ?')
      .get(Number(info.lastInsertRowid));
  });
  const group = tx();
  void actor;
  return serializeBusinessGroup(db, group);
}

/** 整组覆盖设置成员（契约 2.3）：元素须存在且属于该公司；重复元素视为一次 */
export function setGroupMembers(db, { group, actor, userIds }) {
  const company = getCompany(db, group.company_id);
  if (!company) throw notFound('公司不存在');

  const uniqueIds = [...new Set(userIds)];
  for (const userId of uniqueIds) {
    const row = db
      .prepare('SELECT id, company_id FROM users WHERE id = ?')
      .get(userId);
    if (!row || row.company_id !== group.company_id) {
      throw validationError(`成员 ${userId} 不存在或不属于该业务组所在公司`);
    }
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(group.id);
    const insert = db.prepare(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
    );
    for (const userId of uniqueIds) {
      insert.run(group.id, userId);
    }
  });
  tx();
  void actor;
  return serializeBusinessGroup(db, group);
}

/** 公司分配规则列表（契约 2.6） */
export function listAssignmentRules(db, companyId) {
  const company = getCompany(db, companyId);
  if (!company) throw notFound('公司不存在');
  return db
    .prepare(
      `SELECT ar.id, ar.category_id, c.name AS category_name,
              ar.group_id, g.name AS group_name
       FROM assignment_rules ar
       JOIN categories c ON c.id = ar.category_id
       JOIN business_groups g ON g.id = ar.group_id
       WHERE ar.company_id = ?
       ORDER BY ar.id ASC`,
    )
    .all(companyId)
    .map((r) => ({
      id: r.id,
      category: { id: r.category_id, name: r.category_name },
      group: { id: r.group_id, name: r.group_name },
    }));
}

/** 新增分配规则（契约 2.5）：该公司管理员；重复规则 → 409 CONFLICT */
export function createAssignmentRule(db, { company, actor, categoryId, groupId }) {
  const category = db
    .prepare('SELECT id, name FROM categories WHERE id = ?')
    .get(categoryId);
  if (!category) throw validationError('分类不存在');

  const group = db
    .prepare('SELECT id, name, company_id FROM business_groups WHERE id = ?')
    .get(groupId);
  if (!group || group.company_id !== company.id) {
    throw validationError('业务组不存在或不属于该公司');
  }

  const existing = db
    .prepare(
      'SELECT id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
    )
    .get(company.id, categoryId);
  if (existing) throw conflict('该公司该分类已存在分配规则');

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO assignment_rules (company_id, category_id, group_id) VALUES (?, ?, ?)',
      )
      .run(company.id, categoryId, groupId);
    return Number(info.lastInsertRowid);
  });
  const ruleId = tx();
  void actor;
  return {
    id: ruleId,
    category: { id: category.id, name: category.name },
    group: { id: group.id, name: group.name },
  };
}

/** 分类列表（契约 2.7 GET） */
export function listCategories(db) {
  return db.prepare('SELECT id, name FROM categories ORDER BY id ASC').all();
}

/** 新增分类（契约 2.7 POST）：任意公司管理员；同名 → 409 CONFLICT */
export function createCategory(db, { actor, name }) {
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (existing) throw conflict('同名分类已存在');

  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
    return db.prepare('SELECT id, name FROM categories WHERE id = ?').get(
      Number(info.lastInsertRowid),
    );
  });
  const category = tx();
  void actor;
  return category;
}
