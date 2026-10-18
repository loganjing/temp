-- Seed data (architecture baseline §4.3): initial admin, default work calendar,
-- and system skeleton categories. Explicit INSERTs keep a clean directory bootable.
INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at)
VALUES ('usr_admin_seed', '系统管理员', 'admin@helpdesk.local', NULL, 1, NULL,
  '551c2888c735ef9bec4edd5aa0f75dfc:4b8d9ca31bf3394a26d540f3fce02c6b6f6f57a36bc4e1d27075d11e614b294513404badfdc401795fa987b22d2ad1c909214befd2c75d2ce15edff8d8267372',
  0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO biz_users (id, credential_user_id, name_zh, name_en, email, phone, role, company_id, status, created_at, updated_at)
VALUES (1, 'usr_admin_seed', '系统管理员', 'System Administrator', 'admin@helpdesk.local', NULL, 'admin', NULL, 1,
  '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO work_calendar (id, weekdays, work_start_time, work_end_time, timezone, updated_at)
VALUES (1, '[1,2,3,4,5]', '09:00', '18:00', 'Asia/Kuala_Lumpur', '2026-01-01T00:00:00.000Z');

-- System skeleton categories: migration/test fallbacks with no owning department.
-- They must never appear in business-facing category lists (requirements §6.7 / AC-13).
INSERT INTO categories (id, code, name_zh, name_en, department_id, ticket_type, sort_order, status, is_skeleton, created_at, updated_at)
VALUES
  (1, 'SYS-SKELETON-001', '系统骨架分类（迁移兜底）', 'System skeleton (migration fallback)', NULL, 'service_request', 0, 1, 1,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  (2, 'SYS-SKELETON-002', '系统骨架分类（测试兜底）', 'System skeleton (test fallback)', NULL, 'incident', 0, 1, 1,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
