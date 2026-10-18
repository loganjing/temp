-- Land 初始种子（无密码依赖的数据；用户与角色授权在服务启动时由 permissionkit/authkit 幂等写入）。
-- AC-14 验证前提：两套州属面积口径参数版本（雪兰莪特殊口径 / 其他州通用口径）。

INSERT INTO parameter_sets (id, kind, region, version, effective_at, created_by, scope_json, content_json, change_note, created_at) VALUES
  ('param-ac-selangor-v1', 'area-convention', 'Selangor', 1, '2026-01-01T00:00:00.000Z', 'system',
   '{"appliesTo":"state","formats":["residential","apartment","service-apartment","mixed-use"]}',
   '{"name":"雪兰莪特殊口径","efficiencyExParkingDefault":"0.72","description":"雪兰莪州面积计算口径：NFA 按不含车位 GFA 乘以默认效率 72%，塔楼与公共部分分别核算。","nfaMode":"gfa-ex-parking-efficiency"}',
   '初始种子：雪兰莪特殊口径 v1', '2026-01-01T00:00:00.000Z'),
  ('param-ac-general-v1', 'area-convention', NULL, 1, '2026-01-01T00:00:00.000Z', 'system',
   '{"appliesTo":"other-states","formats":["residential","apartment","service-apartment","mixed-use"]}',
   '{"name":"其他州通用口径","efficiencyExParkingDefault":"0.75","description":"其他州通用面积计算口径：NFA 按不含车位 GFA 乘以默认效率 75%。","nfaMode":"gfa-ex-parking-efficiency"}',
   '初始种子：其他州通用口径 v1', '2026-01-01T00:00:00.000Z');
