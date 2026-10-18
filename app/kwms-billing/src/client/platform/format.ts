// 金额（整数分）↔ 元展示换算与数值输入解析（2 位小数口径）。

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return (cents / 100).toFixed(2)
}

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return String(value)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 19)
}

export type AmountParseResult =
  | { ok: true; cents: number | null }
  | { ok: false; message: string }

// 元文本 → 整数分。空文本按「未填」返回 null（必填/正数校验由调用方按场景叠加）。
export function parseYuanToCents(text: string, options: { required?: boolean } = {}): AmountParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    if (options.required) return { ok: false, message: '为必填项' }
    return { ok: true, cents: null }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, message: '须为非负数字，最多 2 位小数' }
  return { ok: true, cents: Math.round(parseFloat(trimmed) * 100) }
}

export type NumberParseResult =
  | { ok: true; value: number }
  | { ok: false; message: string }

// 非负数值（业务量上下限等），最多 2 位小数。
export function parseNonNegativeNumber(text: string): NumberParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, message: '为必填项' }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, message: '须为非负数字，最多 2 位小数' }
  return { ok: true, value: parseFloat(trimmed) }
}

// 百分比 0~100。
export function parsePercent(text: string): NumberParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, message: '为必填项' }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, message: '须为 0~100 的数值' }
  const value = parseFloat(trimmed)
  if (value > 100) return { ok: false, message: '优惠百分比不可超过 100' }
  return { ok: true, value }
}

// 分转元文本（表单回显）。
export function centsToYuanText(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2)
}

// 数值转文本（表单回显）。
export function numberToText(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
