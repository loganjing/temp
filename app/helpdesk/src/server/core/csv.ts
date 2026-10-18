// CSV helpers: escaping, BOM output, and row parsing for imports
// (UTF-8 with BOM, comma-separated, quote-escaped — contract §14).
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map((v) => csvEscape(v === null || v === undefined ? '' : String(v))).join(',')
}

export function csvDocument(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [csvLine(header), ...rows.map((row) => csvLine(row))]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
