/**
 * 定点十进制运算（BigInt 全精度）。
 * 契约第 0/14 节：decimal 以字符串全精度存储，显示层四舍五入且不回写；
 * 计算引擎唯一负责精度，因此所有金额/面积运算走本模块，不使用浮点。
 */

const DIV_PRECISION = 20

export type Decimal = { i: bigint; s: number }

export class DecimalFormatError extends Error {
  constructor(value: unknown) {
    super(`invalid decimal value: ${String(value)}`)
  }
}

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

/** 解析 decimal 字符串（拒绝科学计数法、空串、非数字），number 输入仅接受安全整数形态。 */
export function dec(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') throw new DecimalFormatError(value)
  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new DecimalFormatError(value)
    text = String(value)
  } else {
    text = value.trim()
  }
  if (!DECIMAL_PATTERN.test(text)) throw new DecimalFormatError(value)
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const dot = unsigned.indexOf('.')
  const intPart = dot === -1 ? unsigned : unsigned.slice(0, dot)
  const fracPart = dot === -1 ? '' : unsigned.slice(dot + 1)
  const digits = (intPart + fracPart) || '0'
  const i = BigInt((negative ? '-' : '') + (digits === '' ? '0' : digits))
  return { i, s: fracPart.length }
}

export function decOrNull(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') return null
  return dec(value)
}

export function decInt(value: number | bigint): Decimal {
  return { i: BigInt(value), s: 0 }
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const s = Math.max(a.s, b.s)
  return [scaleUp(a.i, a.s, s), scaleUp(b.i, b.s, s), s]
}

function scaleUp(i: bigint, from: number, to: number): bigint {
  if (from === to) return i
  return i * 10n ** BigInt(to - from)
}

export function add(a: Decimal, b: Decimal): Decimal {
  const [ai, bi, s] = align(a, b)
  return { i: ai + bi, s }
}

export function sub(a: Decimal, b: Decimal): Decimal {
  const [ai, bi, s] = align(a, b)
  return { i: ai - bi, s }
}

export function mul(a: Decimal, b: Decimal): Decimal {
  return { i: a.i * b.i, s: a.s + b.s }
}

/** 除法：内部放大到 DIV_PRECISION 位小数，全精度落库场景足够。分母 scale 先放大再整数相除。 */
export function div(a: Decimal, b: Decimal): Decimal {
  if (b.i === 0n) throw new Error('decimal division by zero')
  const s = DIV_PRECISION
  // a/b = (|a.i| × 10^e) / |b.i| × 10^-s，e = s + b.s - a.s；
  // e < 0 时等价于把分母放大 10^(-e)，仍为精确整数除法（如 s=40/s=60 的 bumi 折扣、pct-revenue 中间值）。
  const e = s + b.s - a.s
  const aAbs = a.i < 0n ? -a.i : a.i
  const bAbs = b.i < 0n ? -b.i : b.i
  const numerator = e >= 0 ? aAbs * 10n ** BigInt(e) : aAbs
  const denominator = e < 0 ? bAbs * 10n ** BigInt(-e) : bAbs
  const sign = (a.i < 0n) !== (b.i < 0n) ? -1n : 1n
  return { i: sign * (numerator / denominator), s }
}

export function neg(a: Decimal): Decimal {
  return { i: -a.i, s: a.s }
}

export function abs(a: Decimal): Decimal {
  return { i: a.i < 0n ? -a.i : a.i, s: a.s }
}

export function isZero(a: Decimal): boolean {
  return a.i === 0n
}

export function cmp(a: Decimal, b: Decimal): number {
  const [ai, bi] = align(a, b)
  return ai === bi ? 0 : ai < bi ? -1 : 1
}

/** 输出字符串：保留完整精度，去掉小数尾零；"-0" 归一为 "0"。 */
export function fmt(a: Decimal): string {
  if (a.i === 0n) return '0'
  const negative = a.i < 0n
  let digits = (negative ? -a.i : a.i).toString()
  let s = a.s
  while (s > 0 && digits.endsWith('0')) {
    digits = digits.slice(0, -1)
    s -= 1
  }
  if (s === 0) return (negative ? '-' : '') + digits
  while (digits.length <= s) digits = '0' + digits
  const intPart = digits.slice(0, digits.length - s)
  const fracPart = digits.slice(digits.length - s)
  return (negative ? '-' : '') + `${intPart}.${fracPart}`
}

/** 百分比字段的统一解释：value 为"每 1 = 100%"口径的份额（如 15 表示 15%）。 */
export function pctShare(value: string | number | null | undefined): Decimal {
  const d = dec(value)
  return div(d, decInt(100))
}

export function sum(list: Decimal[]): Decimal {
  return list.reduce<Decimal>((acc, item) => add(acc, item), decInt(0))
}
