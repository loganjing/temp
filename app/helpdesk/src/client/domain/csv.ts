// CSV 客户端解析/生成：UTF-8 带 BOM、首行表头、逗号分隔、引号转义（契约 §14）。

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      field = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
    } else if (char !== '\r') {
      field += char
    }
  }
  row.push(field)
  if (row.some((value) => value.trim() !== '')) rows.push(row)
  return rows
}

function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const body = rows.map((row) => row.map((cell) => escapeField(cell == null ? '' : String(cell))).join(',')).join('\n')
  return `\uFEFF${body}\n`
}

/** 把解析后的表按首行表头映射为对象行；列数不足的行返回 null */
export function csvToObjects(rows: string[][], columns: string[]): Record<string, string>[] | null {
  if (rows.length === 0) return null
  const header = rows[0].map((cell) => cell.trim())
  const expected = columns.join(',')
  if (header.join(',') !== expected) return null
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    columns.forEach((column, index) => {
      record[column] = (cells[index] ?? '').trim()
    })
    return record
  })
}
