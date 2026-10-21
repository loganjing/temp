import { invalidInput } from './errors'
import { PRIORITIES, STATUSES, type Priority, type Status } from './types'

// 请求体（JSON）校验：类型不符一律 400 INVALID_INPUT。
export function requiredBodyString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw invalidInput(`${name} 必须是非空字符串（≤${maxLength} 字符）`)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw invalidInput(`${name} 长度不能超过 ${maxLength} 字符`)
  return trimmed
}

export function optionalBodyString(value: unknown, name: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw invalidInput(`${name} 必须是字符串`)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw invalidInput(`${name} 长度不能超过 ${maxLength} 字符`)
  return trimmed === '' ? null : trimmed
}

export function requiredBodyInt(value: unknown, name: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  throw invalidInput(`${name} 必须是整数`)
}

export function requiredBodyEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T
  throw invalidInput(`${name} 必须是 ${allowed.join(' / ')} 之一`)
}

export function requiredBodyScore(value: unknown, name: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) return value
  throw invalidInput(`${name} 必须是 1-5 的整数`)
}

// URL 参数校验（path / query 均为字符串）。
export function pathInt(raw: string, name = 'id'): number {
  if (!/^\d+$/.test(raw)) throw invalidInput(`${name} 必须是数字`)
  return Number(raw)
}

export function queryInt(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw === '') return undefined
  if (!/^\d+$/.test(raw)) throw invalidInput(`${name} 必须是数字`)
  return Number(raw)
}

export function queryEnum<T extends string>(raw: string | undefined, name: string, allowed: readonly T[]): T | undefined {
  if (raw === undefined || raw === '') return undefined
  if (allowed.includes(raw as T)) return raw as T
  throw invalidInput(`${name} 必须是 ${allowed.join(' / ')} 之一`)
}

export function queryFlag(raw: string | undefined, name: string): boolean | undefined {
  if (raw === undefined || raw === '') return undefined
  if (raw === '1') return true
  if (raw === '0') return false
  throw invalidInput(`${name} 必须是 0 或 1`)
}

export const queryStatus = (raw: string | undefined): Status | undefined => queryEnum(raw, 'status', STATUSES)
export const queryPriority = (raw: string | undefined): Priority | undefined => queryEnum(raw, 'priority', PRIORITIES)

// LIKE 模糊搜索转义：用户输入中的 % _ \ 不改变匹配语义。
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
