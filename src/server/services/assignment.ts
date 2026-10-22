import { getDb, generateId } from '../db.js';
import { AppError, assertString } from '../errors.js';
import type { Operator } from '../access-control.js';
import type { BusinessGroup, AssignmentRule } from '../../shared/types.js';

// ---- Business Groups ----

export function listBusinessGroups(operator: Operator): { items: BusinessGroup[] } {
  const db = getDb();
  const groups = db.prepare(`
    SELECT id, company_id, name FROM business_group WHERE company_id = ? ORDER BY name
  `).all(operator.companyId) as { id: string; company_id: string; name: string }[];

  const result: BusinessGroup[] = [];
  for (const g of groups) {
    const members = db.prepare(`
      SELECT u.id, u.name, u.email, u.department
      FROM business_group_member m
      JOIN app_user u ON m.user_id = u.id
      WHERE m.group_id = ?
      ORDER BY u.name
    `).all(g.id) as { id: string; name: string; email: string; department: string }[];

    result.push({
      id: g.id,
      companyId: g.company_id,
      name: g.name,
      members: members,
    });
  }
  return { items: result };
}

export function createBusinessGroup(operator: Operator, name: string): BusinessGroup {
  assertString(name, 'name', { min: 1, max: 64 });
  const db = getDb();
  const id = generateId('g_');
  db.prepare('INSERT INTO business_group (id, company_id, name) VALUES (?, ?, ?)')
    .run(id, operator.companyId, name);

  return {
    id,
    companyId: operator.companyId,
    name,
    members: [],
  };
}

export function setGroupMembers(
  operator: Operator,
  groupId: string,
  memberIds: string[]
): BusinessGroup {
  const db = getDb();

  // Verify group belongs to operator's company
  const group = db.prepare('SELECT id, company_id, name FROM business_group WHERE id = ? AND company_id = ?')
    .get(groupId, operator.companyId) as { id: string; company_id: string; name: string } | undefined;
  if (!group) {
    throw new AppError('NOT_FOUND', '业务组不存在或不在可见范围内');
  }

  // Verify all members belong to the same company
  if (memberIds.length > 0) {
    const placeholders = memberIds.map(() => '?').join(',');
    const validMembers = db.prepare(`
      SELECT id FROM app_user WHERE id IN (${placeholders}) AND company_id = ?
    `).all(...memberIds, operator.companyId) as { id: string }[];

    if (validMembers.length !== memberIds.length) {
      const validIds = new Set(validMembers.map((m) => m.id));
      const invalid = memberIds.filter((id) => !validIds.has(id));
      throw new AppError('VALIDATION_FAILED', `以下成员不属于该公司: ${invalid.join(', ')}`, { fields: { memberIds: [`invalid members: ${invalid.join(',')}`] } });
    }
  }

  // Full replace: delete existing, insert new
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM business_group_member WHERE group_id = ?').run(groupId);
    for (const memberId of memberIds) {
      db.prepare('INSERT INTO business_group_member (group_id, user_id) VALUES (?, ?)').run(groupId, memberId);
    }
  });
  tx();

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.department
    FROM business_group_member m
    JOIN app_user u ON m.user_id = u.id
    WHERE m.group_id = ?
    ORDER BY u.name
  `).all(groupId) as { id: string; name: string; email: string; department: string }[];

  return {
    id: group.id,
    companyId: group.company_id,
    name: group.name,
    members: members,
  };
}

// ---- Assignment Rules ----

export function listAssignmentRules(operator: Operator): { items: AssignmentRule[] } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.id, r.company_id, r.category, r.group_id, r.enabled, g.name AS group_name
    FROM assignment_rule r
    JOIN business_group g ON r.group_id = g.id
    WHERE r.company_id = ?
    ORDER BY r.category
  `).all(operator.companyId) as {
    id: string; company_id: string; category: string;
    group_id: string; enabled: number; group_name: string;
  }[];

  return {
    items: rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      category: r.category,
      groupId: r.group_id,
      groupName: r.group_name,
      enabled: r.enabled === 1,
    })),
  };
}

export function createAssignmentRule(
  operator: Operator,
  input: { category: string; groupId: string; enabled: boolean }
): AssignmentRule {
  assertString(input.category, 'category', { min: 1, max: 64 });
  const db = getDb();

  // Verify group belongs to operator's company
  const group = db.prepare('SELECT id, name FROM business_group WHERE id = ? AND company_id = ?')
    .get(input.groupId, operator.companyId) as { id: string; name: string } | undefined;
  if (!group) {
    throw new AppError('VALIDATION_FAILED', '目标业务组不存在或不在可见范围内', { fields: { groupId: ['not found in company'] } });
  }

  // Check for duplicate enabled rule for same company + category
  if (input.enabled) {
    const dup = db.prepare('SELECT 1 FROM assignment_rule WHERE company_id = ? AND category = ? AND enabled = 1')
      .get(operator.companyId, input.category);
    if (dup) {
      throw new AppError('DUPLICATE_RULE', '同一公司同一分类已存在启用规则');
    }
  }

  const id = generateId('r_');
  db.prepare('INSERT INTO assignment_rule (id, company_id, category, group_id, enabled) VALUES (?, ?, ?, ?, ?)')
    .run(id, operator.companyId, input.category, input.groupId, input.enabled ? 1 : 0);

  return {
    id,
    companyId: operator.companyId,
    category: input.category,
    groupId: input.groupId,
    groupName: group.name,
    enabled: input.enabled,
  };
}

export function updateAssignmentRule(
  operator: Operator,
  ruleId: string,
  input: { groupId?: string; enabled?: boolean }
): AssignmentRule {
  const db = getDb();

  const existing = db.prepare(`
    SELECT r.id, r.company_id, r.category, r.group_id, r.enabled, g.name AS group_name
    FROM assignment_rule r
    JOIN business_group g ON r.group_id = g.id
    WHERE r.id = ? AND r.company_id = ?
  `).get(ruleId, operator.companyId) as {
    id: string; company_id: string; category: string;
    group_id: string; enabled: number; group_name: string;
  } | undefined;

  if (!existing) {
    throw new AppError('NOT_FOUND', '分配规则不存在或不在可见范围内');
  }

  let newGroupId = existing.group_id;
  let newEnabled = existing.enabled === 1;
  let newGroupName = existing.group_name;

  if (input.groupId !== undefined) {
    const group = db.prepare('SELECT id, name FROM business_group WHERE id = ? AND company_id = ?')
      .get(input.groupId, operator.companyId) as { id: string; name: string } | undefined;
    if (!group) {
      throw new AppError('VALIDATION_FAILED', '目标业务组不存在或不在可见范围内', { fields: { groupId: ['not found in company'] } });
    }
    newGroupId = group.id;
    newGroupName = group.name;
  }

  if (input.enabled !== undefined) {
    newEnabled = input.enabled;
  }

  // Check duplicate if enabling
  if (newEnabled) {
    const dup = db.prepare('SELECT 1 FROM assignment_rule WHERE company_id = ? AND category = ? AND enabled = 1 AND id != ?')
      .get(operator.companyId, existing.category, ruleId);
    if (dup) {
      throw new AppError('DUPLICATE_RULE', '同一公司同一分类已存在启用规则');
    }
  }

  db.prepare('UPDATE assignment_rule SET group_id = ?, enabled = ? WHERE id = ?')
    .run(newGroupId, newEnabled ? 1 : 0, ruleId);

  return {
    id: existing.id,
    companyId: existing.company_id,
    category: existing.category,
    groupId: newGroupId,
    groupName: newGroupName,
    enabled: newEnabled,
  };
}
