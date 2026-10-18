-- 0004: KWMS 主数据域（组织、仓库、货主、外部合同引用、费用类型、货品类别、货品、当前库存）
-- 金额列不适用本迁移；体积/重量为 REAL 原始精度；日期为 YYYY-MM-DD 文本。
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE warehouses (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX warehouses_org_code_unique ON warehouses(org_id, code);

CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('business', 'customer')),
  code TEXT NOT NULL,
  name TEXT NOT NULL
);

CREATE UNIQUE INDEX owners_org_code_unique ON owners(org_id, code);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  contract_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated'))
);

CREATE UNIQUE INDEX contracts_org_no_unique ON contracts(org_id, contract_no);

CREATE TABLE fee_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE goods_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE goods (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  category_id TEXT REFERENCES goods_categories(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_volume REAL NOT NULL DEFAULT 0,
  unit_gross_weight REAL NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX goods_org_code_unique ON goods(org_id, code);

-- 当前库存事实表（计费度量源），按（仓库、货主、货品）唯一
CREATE TABLE inventory (
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  goods_id TEXT NOT NULL REFERENCES goods(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  occupied_locations INTEGER NOT NULL DEFAULT 0 CHECK (occupied_locations >= 0),
  PRIMARY KEY (warehouse_id, owner_id, goods_id)
);

CREATE INDEX inventory_warehouse_owner_idx ON inventory(warehouse_id, owner_id);

-- 单据编码事务内取号表：前缀 + 当日序号
CREATE TABLE bill_sequences (
  prefix TEXT NOT NULL,
  seq_date TEXT NOT NULL,
  last_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, seq_date)
);
