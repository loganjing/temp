-- 0007: KWMS 调整域（应收费用调整单头部与明细行）
-- 金额列为整数「分」；receivable_detail_id 为空代表手动新增临时费用行。
CREATE TABLE fee_adjustments (
  id TEXT PRIMARY KEY,
  bill_no TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'effective')),
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX fee_adjustments_scope_idx ON fee_adjustments(org_id, status, period_start);

CREATE TABLE fee_adjustment_lines (
  id TEXT PRIMARY KEY,
  adjustment_id TEXT NOT NULL REFERENCES fee_adjustments(id) ON DELETE CASCADE,
  receivable_detail_id TEXT REFERENCES receivable_details(id),
  fee_type_id TEXT NOT NULL REFERENCES fee_types(id),
  business_qty REAL,
  amount_before INTEGER NOT NULL DEFAULT 0,
  -- 周期加载带出的暂存行 adjustment_amount 为 0（保存明细时由服务层校验 > 0）
  adjustment_amount INTEGER NOT NULL CHECK (adjustment_amount >= 0),
  amount_after INTEGER NOT NULL,
  -- 周期加载带出的暂存行 reason 为空（用户在保存明细时填写）；AdjustmentLineInput 保存时必填
  reason TEXT,
  line_no INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX fee_adjustment_lines_adjustment_idx ON fee_adjustment_lines(adjustment_id);
CREATE INDEX fee_adjustment_lines_detail_idx ON fee_adjustment_lines(receivable_detail_id);
