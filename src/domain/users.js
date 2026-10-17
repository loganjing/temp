/**
 * 用户查询与角色判断（src/domain/，架构基线 1.3）。
 * 角色由服务端按数据关系推导，不信任请求体中的任何角色声明。
 */

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.company_id, c.name AS company_name,
         u.department, u.is_company_admin
  FROM users u
  JOIN companies c ON c.id = u.company_id
`;

export function getUserRow(db, userId) {
  return db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(userId);
}

export function listUserRows(db) {
  return db.prepare(`${USER_SELECT} ORDER BY u.id ASC`).all();
}

export function userRef(row) {
  return { id: row.id, name: row.name };
}

export function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: { id: row.company_id, name: row.company_name },
    department: row.department,
    isCompanyAdmin: !!row.is_company_admin,
  };
}

/**
 * 是否指定公司的管理员（契约 2.2 语义：isCompanyAdmin 且 company.id == companyId）。
 * 兼容两种用户形态：API 序列化 User（company 嵌套对象）与 DB 原始行（company_id 顶层字段）。
 */
export function isCompanyAdmin(user, companyId) {
  if (!user) return false;
  const flag = user.isCompanyAdmin ?? user.is_company_admin;
  const userCompanyId = user.company?.id ?? user.company_id;
  return !!flag && userCompanyId === companyId;
}

/** 是否该公司任意业务组的成员（契约 3.6/3.7 “该公司任意业务组成员”） */
export function isMemberOfCompanyGroup(db, userId, companyId) {
  const row = db
    .prepare(
      `SELECT 1 AS hit
       FROM group_members gm
       JOIN business_groups g ON g.id = gm.group_id
       WHERE gm.user_id = ? AND g.company_id = ?
       LIMIT 1`,
    )
    .get(userId, companyId);
  return !!row;
}
