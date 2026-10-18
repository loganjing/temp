-- 0009: KWMS 结算域（应收结算单、开票记录、收款核销记录）
-- 金额列为整数「分」；结算单与对账单一一绑定（recon_statement_id 唯一）。
CREATE TABLE settle_statements (
  id TEXT PRIMARY KEY,
  bill_no TEXT NOT NULL UNIQUE,
  recon_statement_id TEXT NOT NULL UNIQUE REFERENCES recon_statements(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  recon_total_amount INTEGER NOT NULL DEFAULT 0,
  settle_total_amount INTEGER NOT NULL DEFAULT 0,
  invoice_total_amount INTEGER NOT NULL DEFAULT 0,
  writeoff_total_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX settle_statements_scope_idx ON settle_statements(org_id, status);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settle_statements(id) ON DELETE CASCADE,
  invoice_date TEXT NOT NULL,
  invoicer TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX invoices_settlement_idx ON invoices(settlement_id);

CREATE TABLE writeoffs (
  id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settle_statements(id) ON DELETE CASCADE,
  writeoff_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  operator TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX writeoffs_settlement_idx ON writeoffs(settlement_id);
