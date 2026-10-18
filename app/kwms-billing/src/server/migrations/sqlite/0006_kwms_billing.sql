-- 0006: KWMS 计费域（应收费用明细、任务执行记录、站内通知）
-- 金额列为整数「分」；业务量为度量原值（数量/库位为整数，体积/重量为 REAL）。
CREATE TABLE receivable_details (
  id TEXT PRIMARY KEY,
  bill_date TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  fee_type_id TEXT NOT NULL REFERENCES fee_types(id),
  goods_category_id TEXT REFERENCES goods_categories(id),
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('normal', 'fixed_price', 'max_value')),
  billing_basis TEXT CHECK (billing_basis IN ('stock_qty', 'locations', 'volume', 'weight')),
  business_qty REAL,
  raw_amount INTEGER NOT NULL DEFAULT 0,
  discounted_amount INTEGER NOT NULL DEFAULT 0,
  min_charge INTEGER,
  final_amount INTEGER NOT NULL DEFAULT 0,
  quote_bill_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reconciled')),
  created_at TEXT NOT NULL
);

CREATE INDEX receivable_details_scope_idx
  ON receivable_details(org_id, warehouse_id, owner_id, status, bill_date);
CREATE INDEX receivable_details_quote_idx ON receivable_details(quote_bill_no, bill_date);

CREATE TABLE job_runs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('daily_billing', 'monthly_billing', 'contract_expiry')),
  target_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  generated_count INTEGER NOT NULL DEFAULT 0,
  affected_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

-- 支撑 (job_type, target_date) 防重：当日已成功则跳过，失败允许重跑
CREATE INDEX job_runs_dedupe_idx ON job_runs(job_type, target_date, status);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source_run_id TEXT,
  read_flag INTEGER NOT NULL DEFAULT 0 CHECK (read_flag IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX notifications_user_idx ON notifications(user_id, read_flag);
