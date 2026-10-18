-- 资产领用单初始结构：主表、明细分录、单号序列。
-- 列名与需求字段编码一致，API 字段与列同名，无映射转换。

CREATE TABLE asset_apply_bill (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  billno TEXT NOT NULL,
  pick_date TEXT NOT NULL,
  picker TEXT NOT NULL,
  pick_dept TEXT NOT NULL,
  org TEXT NOT NULL,
  purpose TEXT,
  remark TEXT,
  billstatus TEXT NOT NULL DEFAULT '创建',
  creator TEXT NOT NULL,
  createtime TEXT NOT NULL,
  modifier TEXT NOT NULL,
  modifytime TEXT NOT NULL,
  auditor TEXT,
  auditdate TEXT
);

CREATE UNIQUE INDEX idx_asset_apply_bill_billno ON asset_apply_bill (billno);

CREATE TABLE asset_apply_bill_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES asset_apply_bill (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  asset_name TEXT NOT NULL,
  asset_code TEXT,
  spec_model TEXT,
  qty NUMERIC NOT NULL,
  unit TEXT,
  location TEXT,
  line_remark TEXT,
  modifierfield TEXT NOT NULL,
  modifydatefield TEXT NOT NULL
);

CREATE INDEX idx_asset_apply_bill_entry_bill_id ON asset_apply_bill_entry (bill_id);

CREATE TABLE billno_seq (
  prefix TEXT PRIMARY KEY,
  next_seq INTEGER NOT NULL
);
