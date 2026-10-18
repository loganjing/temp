-- Land 业务域表（契约 docs/wi-t1000062/technical-contract.md）
-- decimal 一律 TEXT 全精度字符串；时间 ISO 8601 UTC 文本。

CREATE TABLE parcels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  internal_no TEXT,
  state TEXT,
  city TEXT,
  district TEXT,
  area_sqft TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','in_review','completed','abandoned')),
  current_stage_note TEXT,
  adopted_plan_id TEXT,
  owner_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX parcels_status_idx ON parcels(status);
CREATE INDEX parcels_owner_idx ON parcels(owner_id);
CREATE INDEX parcels_updated_idx ON parcels(updated_at DESC);

CREATE TABLE parcel_profile (
  parcel_id TEXT PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE,
  address TEXT,
  lot_info TEXT,
  tenure TEXT CHECK (tenure IS NULL OR tenure IN ('freehold','leasehold')),
  tenure_years INTEGER,
  total_land_area_sqft TEXT,
  current_use TEXT,
  planned_use TEXT,
  zoning TEXT,
  allowed_development TEXT,
  vendor_asking_price TEXT,
  total_land_price TEXT,
  unit_land_price TEXT,
  land_price_last_edited_basis TEXT CHECK (land_price_last_edited_basis IS NULL OR land_price_last_edited_basis IN ('total','unit')),
  payment_terms TEXT,
  land_financing_note TEXT,
  needs_conversion INTEGER NOT NULL DEFAULT 0 CHECK (needs_conversion IN (0,1)),
  conversion_premium TEXT,
  development_charges TEXT,
  other_gov_charges_note TEXT,
  checklist_json TEXT NOT NULL DEFAULT '[]',
  ownership_company TEXT,
  asset_attribution TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE parcel_status_history (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL
);
CREATE INDEX parcel_status_history_parcel_idx ON parcel_status_history(parcel_id, at DESC);

CREATE TABLE parcel_map (
  parcel_id TEXT PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE,
  lat TEXT,
  lng TEXT,
  boundary_geojson TEXT,
  markers_json TEXT NOT NULL DEFAULT '[]',
  links_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE parcel_map_views (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  view_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX parcel_map_views_parcel_idx ON parcel_map_views(parcel_id, created_at DESC);

CREATE TABLE market_land_refs (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  distance_km TEXT,
  deal_price TEXT,
  price_per_sqft TEXT,
  price_to_revenue_ratio TEXT,
  transacted_at TEXT,
  deal_condition TEXT,
  listing_status TEXT NOT NULL DEFAULT 'unknown' CHECK (listing_status IN ('transacted','listing','unknown')),
  source TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('government','historical-project','market-judgment','client-input','manual-estimate')),
  collected_at TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('verified','probable','unverified')),
  note TEXT
);
CREATE INDEX market_land_refs_parcel_idx ON market_land_refs(parcel_id);

CREATE TABLE market_comps (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  distance_km TEXT,
  format TEXT NOT NULL CHECK (format IN ('residential','apartment','service-apartment','hotel','office','retail','other')),
  type_tier TEXT,
  unit_area_from TEXT,
  unit_area_to TEXT,
  asking_price TEXT,
  price_per_sqft TEXT,
  total_units INTEGER,
  sold_units INTEGER,
  absorption_rate TEXT,
  positioning TEXT,
  incentives TEXT,
  affordable_flag INTEGER NOT NULL DEFAULT 0 CHECK (affordable_flag IN (0,1)),
  project_status TEXT,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual-estimate' CHECK (source_type IN ('government','historical-project','market-judgment','client-input','manual-estimate')),
  collected_at TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('verified','probable','unverified')),
  note TEXT
);
CREATE INDEX market_comps_parcel_idx ON market_comps(parcel_id);

CREATE TABLE quick_assessments (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  inputs_json TEXT NOT NULL,
  results_json TEXT,
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('PASS','REJECT','DROP','INSUFFICIENT')),
  verdict_note TEXT,
  next_action TEXT CHECK (next_action IS NULL OR next_action IN ('market-research','title-verification','site-visit','price-negotiation','jv','abandon')),
  next_action_note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX quick_assessments_parcel_idx ON quick_assessments(parcel_id);
CREATE INDEX quick_assessments_verdict_idx ON quick_assessments(verdict);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'baseline' CHECK (kind IN ('baseline','candidate')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved','formalized','in_review','adopted','not_selected','returned')),
  source_plan_id TEXT,
  copied_at TEXT,
  copied_by TEXT,
  change_note TEXT,
  owner_id TEXT NOT NULL,
  assumption_tags_json TEXT NOT NULL DEFAULT '[]',
  parameter_refs_json TEXT NOT NULL DEFAULT '{}',
  phase_count INTEGER NOT NULL DEFAULT 1,
  area_basis_json TEXT NOT NULL DEFAULT '{}',
  parking_json TEXT NOT NULL DEFAULT '{}',
  land_price_json TEXT NOT NULL DEFAULT '{}',
  results_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX plans_parcel_idx ON plans(parcel_id, updated_at DESC);
CREATE INDEX plans_status_idx ON plans(status);

CREATE TABLE plan_phases (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seq INTEGER NOT NULL,
  land_allocation_json TEXT NOT NULL DEFAULT '{}',
  gfa_breakdown_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX plan_phases_plan_idx ON plan_phases(plan_id, seq);

CREATE TABLE plan_products (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES plan_phases(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL CHECK (format IN ('residential','apartment','service-apartment','hotel','office','retail','other','mixed-use')),
  tier TEXT,
  share_pct TEXT NOT NULL DEFAULT '0',
  units INTEGER NOT NULL DEFAULT 0,
  unit_area_sqft TEXT NOT NULL DEFAULT '0',
  saleable_area_sqft TEXT NOT NULL DEFAULT '0',
  price TEXT,
  price_per_sqft TEXT,
  price_basis TEXT NOT NULL DEFAULT 'unit-price' CHECK (price_basis IN ('unit-price','per-sqft','policy-fixed')),
  bumi_quota_pct TEXT,
  bumi_discount_pct TEXT,
  affordable_quota_json TEXT,
  parking_per_unit TEXT
);
CREATE INDEX plan_products_phase_idx ON plan_products(phase_id);

CREATE TABLE plan_cost_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES plan_phases(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('land','construction','infrastructure','furniture-equipment','contingency-tax','misc-gov','professional-pm','sales-marketing','finance')),
  item_name TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('fixed','per-land-area','per-gfa','per-saleable','pct-revenue','pct-cost','per-unit','per-parking','per-year')),
  value TEXT NOT NULL DEFAULT '0',
  source_type TEXT NOT NULL CHECK (source_type IN ('government','historical-project','market-judgment','client-input','manual-estimate')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed','zero','pending')),
  note TEXT
);
CREATE INDEX plan_cost_items_plan_idx ON plan_cost_items(plan_id, category);

CREATE TABLE plan_parking (
  plan_id TEXT PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
  gov_min INTEGER NOT NULL DEFAULT 0,
  internal_target INTEGER NOT NULL DEFAULT 0,
  used_basis TEXT NOT NULL DEFAULT 'gov' CHECK (used_basis IN ('gov','internal')),
  visitor_slots INTEGER,
  extra_internal_slots INTEGER,
  area_per_slot_sqft TEXT NOT NULL DEFAULT '0'
);

CREATE TABLE plan_common_pools (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('land','construction','infrastructure','furniture-equipment','contingency-tax','misc-gov','professional-pm','sales-marketing','finance')),
  amount TEXT NOT NULL DEFAULT '0',
  allocation_basis TEXT NOT NULL CHECK (allocation_basis IN ('saleable-area','gfa','units','custom-ratio')),
  custom_ratios_json TEXT,
  rule_note TEXT
);
CREATE INDEX plan_common_pools_plan_idx ON plan_common_pools(plan_id);

CREATE TABLE plan_snapshots (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('formalized','adopted')),
  inputs_json TEXT NOT NULL,
  results_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX plan_snapshots_plan_idx ON plan_snapshots(plan_id, created_at DESC);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  plan_ids_json TEXT NOT NULL,
  note TEXT,
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  updated_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','returned'))
);
CREATE INDEX submissions_parcel_idx ON submissions(parcel_id, submitted_at DESC);

CREATE TABLE submission_actions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve','return')),
  reason TEXT,
  selected_plan_id TEXT,
  at TEXT NOT NULL
);
CREATE INDEX submission_actions_submission_idx ON submission_actions(submission_id, at DESC);

CREATE TABLE decision_records (
  parcel_id TEXT PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE,
  adopted_plan_id TEXT,
  action TEXT CHECK (action IS NULL OR action IN ('continue','abandon','negotiate','site-visit','jv')),
  reason TEXT,
  decided_at TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  handoff_to TEXT
);

CREATE TABLE handoff_exports (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  adopted_plan_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_json TEXT NOT NULL,
  generated_by TEXT,
  generated_at TEXT NOT NULL
);
CREATE INDEX handoff_exports_parcel_idx ON handoff_exports(parcel_id, generated_at DESC);

CREATE TABLE parameter_sets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('area-convention','cost-package','policy','fee-item','option-list')),
  region TEXT,
  version INTEGER NOT NULL,
  effective_at TEXT NOT NULL,
  created_by TEXT,
  scope_json TEXT NOT NULL DEFAULT '{}',
  content_json TEXT NOT NULL,
  change_note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX parameter_sets_kind_idx ON parameter_sets(kind, region, effective_at DESC, version DESC);

CREATE TABLE ai_suggestions (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('market-summary','plan-adjustment')),
  target_plan_id TEXT,
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed')),
  content_json TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_suggestions_parcel_idx ON ai_suggestions(parcel_id);

CREATE TABLE parcel_attachments (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('title-deed','planning','vendor-quotation','meeting','photo','other')),
  file_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  path TEXT NOT NULL,
  note TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX parcel_attachments_parcel_idx ON parcel_attachments(parcel_id, uploaded_at DESC);
