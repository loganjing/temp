-- 0008: KWMS 对账域（应收对账单与快照明细行）
-- 金额列为整数「分」；明细行为审核时锁定的快照。
CREATE TABLE recon_statements (
  id TEXT PRIMARY KEY,
  bill_no TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_amount INTEGER NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  remark TEXT,
  created_at TEXT NOT NULL,
  audited_at TEXT
);

CREATE INDEX recon_statements_scope_idx ON recon_statements(org_id, status, period_start);

CREATE TABLE recon_statement_lines (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES recon_statements(id) ON DELETE CASCADE,
  receivable_detail_id TEXT NOT NULL REFERENCES receivable_details(id),
  goods_category_id TEXT,
  bill_date TEXT NOT NULL,
  fee_type_id TEXT NOT NULL REFERENCES fee_types(id),
  billing_mode TEXT NOT NULL,
  business_qty REAL,
  unit_price INTEGER,
  min_charge INTEGER,
  raw_amount INTEGER NOT NULL DEFAULT 0,
  final_amount INTEGER NOT NULL DEFAULT 0,
  line_no INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX recon_statement_lines_statement_idx ON recon_statement_lines(statement_id);
