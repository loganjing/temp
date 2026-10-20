/** ISO 8601 UTC 时间戳（契约 §1 时间格式）。 */
export function nowIso(): string {
  return new Date().toISOString()
}

/** LIKE 模式字面转义（配合 SQL 中的 ESCAPE '\'）。 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
