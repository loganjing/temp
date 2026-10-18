-- 0005: KWMS 报价域（仓储合同报价单头部、费用明细行、分段优惠）
-- 金额列（unit_price / min_charge / fixed_amount / fixed_value）为整数「分」。
CREATE TABLE cc_quotes (
  id TEXT PRIMARY KEY,
  bill_no TEXT NOT NULL UNIQUE,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('business', 'customer')),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  effect_start TEXT NOT NULL,
  effect_end TEXT NOT NULL,
  rent_free_days INTEGER NOT NULL CHECK (rent_free_days IN (0, 7, 15, 30)),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('daily', 'monthly')),
  settlement_mode TEXT NOT NULL DEFAULT 'monthly' CHECK (settlement_mode IN ('monthly', 'prepaid')),
  insurance_required INTEGER NOT NULL DEFAULT 0 CHECK (insurance_required IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'effective', 'terminated')),
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX cc_quotes_scope_idx ON cc_quotes(org_id, warehouse_id, owner_id, status);
CREATE INDEX cc_quotes_effect_idx ON cc_quotes(status, effect_start, effect_end);

CREATE TABLE cc_quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES cc_quotes(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  fee_type_id TEXT NOT NULL REFERENCES fee_types(id),
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('normal', 'fixed_price', 'max_value')),
  billing_basis TEXT CHECK (billing_basis IN ('stock_qty', 'locations', 'volume', 'weight')),
  goods_category_id TEXT REFERENCES goods_categories(id),
  unit_price INTEGER,
  min_charge INTEGER,
  fixed_amount INTEGER
);

CREATE UNIQUE INDEX cc_quote_lines_quote_line_no_unique ON cc_quote_lines(quote_id, line_no);

CREATE TABLE cc_quote_discounts (
  id TEXT PRIMARY KEY,
  quote_line_id TEXT NOT NULL REFERENCES cc_quote_lines(id) ON DELETE CASCADE,
  lower_limit REAL NOT NULL CHECK (lower_limit >= 0),
  upper_limit REAL NOT NULL,
  discount_mode TEXT NOT NULL CHECK (discount_mode IN ('percent', 'fixed')),
  percent_value REAL,
  fixed_value INTEGER
);

CREATE INDEX cc_quote_discounts_line_idx ON cc_quote_discounts(quote_line_id);
