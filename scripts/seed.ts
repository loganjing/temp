import { openDatabase, runMigrations, type DB } from '@commonapp/dbkit';
import { initAudit } from '@commonapp/auditkit';
import { hashPassword } from '@commonapp/authkit';

/**
 * Seed script: creates reference data (companies, departments, users, categories)
 * and sample business groups + assignment rules for testing.
 *
 * Usage: npm run seed
 * Environment: DB_PATH (default: ./data/application.db)
 */

const dbPath = process.env.DB_PATH || './data/application.db';
const migrationsDir = process.env.MIGRATIONS_DIR || './migrations/sqlite';

const db: DB = openDatabase({ path: dbPath });
runMigrations(db, { directory: migrationsDir });
initAudit(db);

console.log('[seed] Starting seed data insertion...');

// Use a transaction for the entire seed
const seed = db.transaction(() => {
  // --- Companies ---
  const companyA = db.prepare('INSERT OR IGNORE INTO companies (id, name) VALUES (?, ?)').run(1, '公司A');
  const companyB = db.prepare('INSERT OR IGNORE INTO companies (id, name) VALUES (?, ?)').run(2, '公司B');

  // --- Departments ---
  const deptData = [
    [1, 1, '技术部'],
    [2, 1, '市场部'],
    [3, 2, '运维部'],
    [4, 2, '产品部'],
  ];
  for (const [id, companyId, name] of deptData) {
    db.prepare('INSERT OR IGNORE INTO departments (id, company_id, name) VALUES (?, ?, ?)').run(
      id, companyId, name
    );
  }

  // --- Users ---
  // All passwords are "password123" (hashed)
  const passwordHash = hashPassword('password123');

  const userData = [
    // id, name, email, password, company_id, department_id, roles
    [1, '张三', 'submitter@a.com', passwordHash, 1, 1, 'submitter'],
    [2, '李四', 'handler1@a.com', passwordHash, 1, 1, 'handler'],
    [3, '王五', 'handler2@a.com', passwordHash, 1, 2, 'handler'],
    [4, '管理员A', 'admin@a.com', passwordHash, 1, 1, 'admin'],
    [5, '赵六', 'submitter@b.com', passwordHash, 2, 3, 'submitter'],
    [6, '孙七', 'handler1@b.com', passwordHash, 2, 3, 'handler'],
    [7, '管理员B', 'admin@b.com', passwordHash, 2, 4, 'admin'],
  ];
  for (const [id, name, email, pwd, companyId, deptId, roles] of userData) {
    db.prepare(
      'INSERT OR IGNORE INTO users (id, name, email, password, company_id, department_id, roles) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, email, pwd, companyId, deptId, roles);
  }

  // --- Categories ---
  const categoryData = [
    [1, '网络故障'],
    [2, '软件问题'],
    [3, '硬件问题'],
    [4, '账号权限'],
    [5, '其他'],
  ];
  for (const [id, name] of categoryData) {
    db.prepare('INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)').run(id, name);
  }

  // --- Business Groups ---
  const groupData = [
    [1, 1, '网络运维组'],
    [2, 1, '软件支持组'],
    [3, 2, '综合运维组'],
  ];
  for (const [id, companyId, name] of groupData) {
    db.prepare('INSERT OR IGNORE INTO business_groups (id, company_id, name) VALUES (?, ?, ?)').run(
      id, companyId, name
    );
  }

  // --- Business Group Members ---
  const memberData = [
    [1, 1, 2], // 李四 in 网络运维组
    [2, 1, 3], // 王五 in 网络运维组
    [3, 2, 3], // 王五 in 软件支持组
    [4, 3, 6], // 孙七 in 综合运维组
  ];
  for (const [id, groupId, userId] of memberData) {
    db.prepare(
      'INSERT OR IGNORE INTO business_group_members (id, group_id, user_id) VALUES (?, ?, ?)'
    ).run(id, groupId, userId);
  }

  // --- Category Assignment Rules ---
  const ruleData = [
    [1, 1, 1, 1], // 公司A, 网络故障 -> 网络运维组
    [2, 1, 2, 2], // 公司A, 软件问题 -> 软件支持组
    [3, 2, 1, 3], // 公司B, 网络故障 -> 综合运维组
  ];
  for (const [id, companyId, categoryId, targetGroupId] of ruleData) {
    db.prepare(
      'INSERT OR IGNORE INTO category_assignment_rules (id, company_id, category_id, target_group_id) VALUES (?, ?, ?, ?)'
    ).run(id, companyId, categoryId, targetGroupId);
  }

  console.log('[seed] Seed data inserted successfully.');
  console.log('[seed] Test accounts (password: password123):');
  console.log('  submitter@a.com  (submitter, 公司A)');
  console.log('  handler1@a.com   (handler, 公司A)');
  console.log('  handler2@a.com   (handler, 公司A)');
  console.log('  admin@a.com      (admin, 公司A)');
  console.log('  submitter@b.com  (submitter, 公司B)');
  console.log('  handler1@b.com   (handler, 公司B)');
  console.log('  admin@b.com      (admin, 公司B)');
});

seed();
db.close();
