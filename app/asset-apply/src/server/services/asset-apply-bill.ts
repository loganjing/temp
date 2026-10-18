import type { DbClient } from '@commonapp/dbkit'
import {
  ASSET_APPLY_BILL_ERROR_CODES,
  ASSET_APPLY_BILL_MESSAGES,
  type ApiErrorDetail,
  type AssetApplyBill,
  type AssetApplyBillEntry,
  type AssetApplyBillListQuery,
  type AssetApplyBillListResult,
  type AssetApplyBillSummary,
} from '../../shared/asset-apply-bill'

const DEFAULT_USER = '系统用户'
const BILL_STATUS_CREATED = '创建'
const BILLNO_PREFIX = 'LY'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/** 领用单业务错误：HTTP 层映射为统一错误结构，details 提供字段级定位。 */
export class AssetApplyBillError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message)
    this.name = 'AssetApplyBillError'
  }
}

type NormalizedEntry = {
  asset_name: string
  asset_code: string | null
  spec_model: string | null
  qty: number
  unit: string | null
  location: string | null
  line_remark: string | null
}

type NormalizedBill = {
  pick_date: string
  picker: string
  pick_dept: string
  org: string
  purpose: string | null
  remark: string | null
  entries: NormalizedEntry[]
}

// ---------- 创建保存 ----------

/** 权威校验 → 事务内取号 → 主表与分录原子落库；返回完整单据。 */
export async function createAssetApplyBill(db: DbClient, input: unknown): Promise<AssetApplyBill> {
  const { details, bill } = readBillInput(input)
  if (!bill) {
    throw new AssetApplyBillError(
      400,
      ASSET_APPLY_BILL_ERROR_CODES.VALIDATION_FAILED,
      ASSET_APPLY_BILL_MESSAGES.VALIDATION_SUMMARY,
      details,
    )
  }
  try {
    return await insertBill(db, bill)
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    // 单号唯一约束兜底：重新取号保存一次，仍冲突才返回 409。
    try {
      return await insertBill(db, bill)
    } catch (retryError) {
      if (isUniqueConstraintError(retryError)) {
        throw new AssetApplyBillError(
          409,
          ASSET_APPLY_BILL_ERROR_CODES.BILLNO_CONFLICT,
          ASSET_APPLY_BILL_MESSAGES.BILLNO_CONFLICT,
        )
      }
      throw retryError
    }
  }
}

/** 校验并规范请求体：details 收集全部错误；bill 为 null 表示校验未通过。 */
function readBillInput(input: unknown): { details: ApiErrorDetail[]; bill: NormalizedBill | null } {
  const details: ApiErrorDetail[] = []
  const body = isRecord(input) ? input : {}

  let pickDate: string | null = null
  const rawPickDate = body.pick_date
  if (typeof rawPickDate !== 'string' || rawPickDate.trim() === '') {
    details.push({ path: 'pick_date', message: ASSET_APPLY_BILL_MESSAGES.PICK_DATE_REQUIRED })
  } else if (!isDateString(rawPickDate.trim())) {
    details.push({ path: 'pick_date', message: ASSET_APPLY_BILL_MESSAGES.PICK_DATE_INVALID })
  } else {
    pickDate = rawPickDate.trim()
  }

  const picker = requiredText(body, 'picker', ASSET_APPLY_BILL_MESSAGES.PICKER_REQUIRED, details)
  const pickDept = requiredText(body, 'pick_dept', ASSET_APPLY_BILL_MESSAGES.PICK_DEPT_REQUIRED, details)
  const org = requiredText(body, 'org', ASSET_APPLY_BILL_MESSAGES.ORG_REQUIRED, details)

  const entries: NormalizedEntry[] = []
  const rawEntries = body.entries
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    details.push({ path: 'entries', message: ASSET_APPLY_BILL_MESSAGES.ENTRIES_REQUIRED })
  } else {
    for (const [index, rawEntry] of rawEntries.entries()) {
      const entry = isRecord(rawEntry) ? rawEntry : {}
      const assetName = optionalText(entry.asset_name)
      if (assetName === null) {
        details.push({ path: `entries[${index}].asset_name`, message: ASSET_APPLY_BILL_MESSAGES.ASSET_NAME_REQUIRED })
      }
      if (typeof entry.qty !== 'number' || !Number.isFinite(entry.qty)) {
        details.push({ path: `entries[${index}].qty`, message: ASSET_APPLY_BILL_MESSAGES.QTY_REQUIRED })
      }
      if (assetName !== null && typeof entry.qty === 'number' && Number.isFinite(entry.qty)) {
        entries.push({
          asset_name: assetName,
          asset_code: optionalText(entry.asset_code),
          spec_model: optionalText(entry.spec_model),
          qty: entry.qty,
          unit: optionalText(entry.unit),
          location: optionalText(entry.location),
          line_remark: optionalText(entry.line_remark),
        })
      }
    }
  }

  if (details.length > 0 || picker === null || pickDept === null || org === null || pickDate === null) {
    return { details, bill: null }
  }
  return {
    details,
    bill: {
      pick_date: pickDate,
      picker,
      pick_dept: pickDept,
      org,
      purpose: optionalText(body.purpose),
      remark: optionalText(body.remark),
      entries,
    },
  }
}

/** 单个写事务：取号 → 插入主表 → 插入全部分录 → 读回完整单据；任一步失败整体回滚。 */
async function insertBill(db: DbClient, bill: NormalizedBill): Promise<AssetApplyBill> {
  const now = new Date()
  const nowText = formatLocalDateTime(now)
  return db.transaction(async (tx) => {
    const billno = await allocateBillno(tx, now)
    const mainRow = await tx.queryOne<{ id: number }>({
      text: `INSERT INTO asset_apply_bill
        (billno, pick_date, picker, pick_dept, org, purpose, remark, billstatus, creator, createtime, modifier, modifytime, auditor, auditdate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id`,
      params: [
        billno,
        bill.pick_date,
        bill.picker,
        bill.pick_dept,
        bill.org,
        bill.purpose,
        bill.remark,
        BILL_STATUS_CREATED,
        DEFAULT_USER,
        nowText,
        DEFAULT_USER,
        nowText,
        null,
        null,
      ],
    })
    const billId = mainRow?.id
    if (!billId) throw new Error('领用单主表插入未返回 id')
    for (const [index, entry] of bill.entries.entries()) {
      await tx.run({
        text: `INSERT INTO asset_apply_bill_entry
          (bill_id, seq, asset_name, asset_code, spec_model, qty, unit, location, line_remark, modifierfield, modifydatefield)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          billId,
          index + 1,
          entry.asset_name,
          entry.asset_code,
          entry.spec_model,
          entry.qty,
          entry.unit,
          entry.location,
          entry.line_remark,
          DEFAULT_USER,
          nowText,
        ],
      })
    }
    const saved = await loadBill(tx, billId)
    if (!saved) throw new Error('领用单保存后未能读回')
    return saved
  })
}

/** 事务内原子取号：LY + yyyyMMdd + 至少 4 位流水，单日超 9999 时自动扩位。 */
async function allocateBillno(tx: DbClient, now: Date): Promise<string> {
  const prefix = `${BILLNO_PREFIX}${formatLocalDateCompact(now)}`
  await tx.run({ text: 'INSERT OR IGNORE INTO billno_seq (prefix, next_seq) VALUES (?, 1)', params: [prefix] })
  const row = await tx.queryOne<{ seq: number }>({
    text: 'UPDATE billno_seq SET next_seq = next_seq + 1 WHERE prefix = ? RETURNING next_seq - 1 AS seq',
    params: [prefix],
  })
  if (!row) throw new Error('单号序列取号失败')
  return prefix + String(row.seq).padStart(4, '0')
}

// ---------- 查询与详情 ----------

const BILL_COLUMNS =
  'id, billno, pick_date, picker, pick_dept, org, purpose, remark, billstatus, creator, createtime, modifier, modifytime, auditor, auditdate'
const ENTRY_COLUMNS =
  'id, seq, asset_name, asset_code, spec_model, qty, unit, location, line_remark, modifierfield, modifydatefield'
const SUMMARY_COLUMNS =
  'id, billno, pick_date, picker, pick_dept, org, billstatus, createtime, modifier, modifytime'

/** 详情回读：主表全字段 + 分录按 seq 升序；不存在抛 BILL_NOT_FOUND。 */
export async function getAssetApplyBill(db: DbClient, id: number): Promise<AssetApplyBill> {
  const bill = await loadBill(db, id)
  if (!bill) {
    throw new AssetApplyBillError(
      404,
      ASSET_APPLY_BILL_ERROR_CODES.BILL_NOT_FOUND,
      ASSET_APPLY_BILL_MESSAGES.BILL_NOT_FOUND,
    )
  }
  return bill
}

async function loadBill(db: DbClient, id: number): Promise<AssetApplyBill | null> {
  const billRow = await db.queryOne<Omit<AssetApplyBill, 'entries'>>({
    text: `SELECT ${BILL_COLUMNS} FROM asset_apply_bill WHERE id = ?`,
    params: [id],
  })
  if (!billRow) return null
  const entries = await db.queryAll<AssetApplyBillEntry>({
    text: `SELECT ${ENTRY_COLUMNS} FROM asset_apply_bill_entry WHERE bill_id = ? ORDER BY seq ASC, id ASC`,
    params: [id],
  })
  return { ...billRow, entries }
}

/** 解析查询字符串：billno/picker 忽略首尾空格，非法分页参数按默认值/上限处理。 */
export function parseListQuery(params: Record<string, string | undefined>): AssetApplyBillListQuery {
  const trimmed = (name: string): string | undefined => {
    const value = params[name]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }
  return {
    billno: trimmed('billno'),
    picker: trimmed('picker'),
    pick_date: trimmed('pick_date'),
    page: parsePositiveInt(params.page, 1),
    pageSize: Math.min(parsePositiveInt(params.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
  }
}

/** 条件查询：billno/picker 包含匹配、pick_date 精确，按 createtime 降序分页。 */
export async function listAssetApplyBills(
  db: DbClient,
  query: AssetApplyBillListQuery,
): Promise<AssetApplyBillListResult> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (query.billno) {
    conditions.push("billno LIKE ? ESCAPE '\\'")
    params.push(`%${escapeLike(query.billno)}%`)
  }
  if (query.picker) {
    conditions.push("picker LIKE ? ESCAPE '\\'")
    params.push(`%${escapeLike(query.picker)}%`)
  }
  if (query.pick_date) {
    conditions.push('pick_date = ?')
    params.push(query.pick_date)
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

  const totalRow = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM asset_apply_bill${where}`,
    params,
  })
  const items = await db.queryAll<AssetApplyBillSummary>({
    text: `SELECT ${SUMMARY_COLUMNS} FROM asset_apply_bill${where} ORDER BY createtime DESC, id DESC LIMIT ? OFFSET ?`,
    params: [...params, query.pageSize, (query.page - 1) * query.pageSize],
  })
  return { items, total: totalRow?.total ?? 0, page: query.page, pageSize: query.pageSize }
}

// ---------- 工具 ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(
  body: Record<string, unknown>,
  field: string,
  missingMessage: string,
  details: ApiErrorDetail[],
): string | null {
  const value = body[field]
  if (typeof value !== 'string' || value.trim() === '') {
    details.push({ path: field, message: missingMessage })
    return null
  }
  return value.trim()
}

/** 可选文本：trim 后为空串视为 NULL，非字符串视为未提供。 */
function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  )
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 服务器本地时间 yyyy-MM-ddTHH:mm:ss（无时区后缀）。 */
function formatLocalDateTime(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  )
}

/** 服务器本地日期 yyyyMMdd（单号前缀日期段）。 */
function formatLocalDateCompact(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}
