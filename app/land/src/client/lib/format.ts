/**
 * 展示层格式化与业务标签映射（纯函数，不含业务计算公式）。
 * 契约第 14 节：decimal 为服务端全精度字符串；此处仅做展示四舍五入，不回写任何计算值。
 */

/** 金额展示：千分位、最多 2 位小数；null/undefined 显示 “—”。 */
export function displayMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

/** 数量/面积展示：千分位、最多 2 位小数。 */
export function displayNumber(value: string | number | null | undefined): string {
  return displayMoney(value)
}

/** 比率（每 1 = 100% 口径，如 pm=0.2341）展示为百分比，2 位小数。 */
export function displayPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return `${(num * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`
}

/** 已是百分比口径的数值（如 sharePct=60）直接展示。 */
export function displayPercentValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return `${num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`
}

/** datetime（ISO 8601 UTC）本地化展示。 */
export function displayDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function displayBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

// —— 业务标签（封闭枚举的中文展示，均来自契约） ——

export const PARCEL_STATUS_LABELS: Record<string, string> = {
  processing: '处理中',
  in_review: '审批中',
  completed: '已完成',
  abandoned: '已放弃/终止',
}

export const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  saved: '已保存',
  formalized: '已正式化',
  in_review: '审批中',
  adopted: '已采用/冻结',
  not_selected: '未采用',
  returned: '已退回',
}

export const PLAN_KIND_LABELS: Record<string, string> = {
  baseline: '基准方案',
  candidate: '候选方案',
}

export const COST_CATEGORY_LABELS: Record<string, string> = {
  land: '土地成本',
  construction: '主体建筑',
  infrastructure: '基础设施',
  'furniture-equipment': '家具设备装修',
  'contingency-tax': '预备费税费',
  'misc-gov': '杂项及政府贡献',
  'professional-pm': '专业及项目管理',
  'sales-marketing': '销售与市场',
  finance: '融资费用',
}

export const COST_BASIS_LABELS: Record<string, string> = {
  fixed: '固定金额',
  'per-land-area': '按土地面积',
  'per-gfa': '按建筑面积',
  'per-saleable': '按可售面积',
  'pct-revenue': '按收入比例(%)',
  'pct-cost': '按建筑成本比例(%)',
  'per-unit': '按单位数',
  'per-parking': '按车位数',
  'per-year': '按年限',
}

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  government: '政府要求',
  'historical-project': '历史项目',
  'market-judgment': '市场判断',
  'client-input': '客户输入',
  'manual-estimate': '人工估算',
}

export const CONFIDENCE_LABELS: Record<string, string> = {
  verified: '已核实',
  probable: '较可信',
  unverified: '待确认',
}

export const LISTING_STATUS_LABELS: Record<string, string> = {
  transacted: '已成交',
  listing: '挂牌',
  unknown: '未知',
}

export const FORMAT_LABELS: Record<string, string> = {
  residential: '住宅',
  apartment: '公寓',
  'service-apartment': '服务式公寓',
  hotel: '酒店',
  office: '办公',
  retail: '零售',
  other: '其他',
  'mixed-use': '综合',
}

export const CHECKLIST_ITEM_LABELS: Record<string, string> = {
  'title-verified': '地契产权核实',
  'use-supported': '现有用途支持目标开发',
  'conversion-needed': '用途转换/额外审批',
  'plot-ratio-basis': '容积率/密度政府依据',
  'school-contribution': '学校贡献',
  'cemetery-contribution': '墓地贡献',
  'road-drainage': '道路/排水贡献',
  'site-conditions': '现场交通/地形/拆除条件',
  'charges-in-landprice': '发展费计入地价',
  'charges-in-cost': '政府收费计入成本',
}

export const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  confirmed: '已确认',
  assumed: '假设',
  pending: '待确认',
}

export const VERDICT_LABELS: Record<string, string> = {
  PASS: 'PASS（继续推进）',
  REJECT: 'REJECT（不建议）',
  DROP: 'DROP（放弃）',
  INSUFFICIENT: '资料不足',
}

export const NEXT_ACTION_LABELS: Record<string, string> = {
  'market-research': '继续市场研究',
  'title-verification': '核查地契/政府依据',
  'site-visit': '实地查看',
  'price-negotiation': '与地主谈价',
  jv: '合作开发评估',
  abandon: '放弃',
}

export const DECISION_ACTION_LABELS: Record<string, string> = {
  continue: '继续推进',
  abandon: '放弃/终止',
  negotiate: '谈价',
  'site-visit': '实地查看',
  jv: '合作开发',
}

export const SENSITIVITY_VARIABLE_LABELS: Record<string, string> = {
  'land-price': '土地总价/单位地价',
  'unit-price': '产品售价',
  'construction-cost': '建筑成本（会议必含项）',
  'plot-ratio': '容积率/密度',
  efficiency: '建筑效率',
  'conversion-premium': '转换溢价/发展费/政府贡献',
  'finance-rate': '融资比例/利率',
  'finance-term': '融资年限',
  'affordable-ratio': '可负担产品比例',
  'parking-count': '车位数量',
  'product-mix': '产品组合',
}

export const BACK_SOLVE_LABELS: Record<string, string> = {
  'max-land-price': '可接受最高地价',
  'min-unit-price': '最低售价',
  'max-construction-cost': '可承受最高建筑成本',
}

export const ALLOCATION_BASIS_LABELS: Record<string, string> = {
  'saleable-area': '按可售面积',
  gfa: '按建筑面积',
  units: '按单位数',
  'custom-ratio': '自定义比例',
}

export const LAND_ALLOCATION_LABELS: Record<string, string> = {
  'by-land-area': '按土地面积',
  'by-gfa': '按建筑面积',
  manual: '手动指定',
}

export const ATTACHMENT_CATEGORY_LABELS: Record<string, string> = {
  'title-deed': '地契/地权文件',
  planning: '规划资料',
  'vendor-quotation': '地主报价',
  meeting: '会议材料',
  photo: '现场照片',
  other: '其他',
}

export const MARKER_KIND_LABELS: Record<string, string> = {
  parcel: '本地块',
  competitor: '竞品项目',
  'land-deal': '历史成交地块',
  poi: '周边设施',
}

export const ROLE_LABELS: Record<string, string> = {
  'investment-officer': '投资业务人员',
  'plan-owner': '方案负责人',
  'market-researcher': '市场/研究人员',
  'finance-cost': '财务/成本人员',
  approver: '管理层/审批人',
  downstream: '下游部门',
  admin: '业务规则管理员',
}

export const PARAMETER_KIND_LABELS: Record<string, string> = {
  'area-convention': '面积口径',
  'cost-package': '成本套餐',
  policy: '政策比例',
  'fee-item': '费用项',
  'option-list': '选项列表',
}

export const REPORT_SECTION_LABELS: Record<string, string> = {
  conclusion: '项目结论',
  'site-overview': '地块概况',
  location: '位置和可达性',
  market: '市场研究',
  'dev-plan': '开发方案',
  'financial-summary': '财务摘要',
  'cost-structure': '成本结构',
  'sensitivity-risk': '敏感性与风险',
  'jv-phasing': '合作或分期方案',
  'recommended-actions': '推荐动作',
}

/** 事实/假设分层标签（报告区分市场事实/业务判断/测算假设）。 */
export const LAYER_LABELS: Record<string, string> = {
  'business-fact': '业务事实',
  'market-fact': '市场事实',
  'business-judgment': '业务判断',
  'calculation-assumption': '测算假设',
  pending: '待核算',
}
