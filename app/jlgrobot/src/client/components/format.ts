// 纯前端展示工具：时间格式化、参数渲染、设备名查找。
// 不做权限或正式状态判断。

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatParams(params: Record<string, unknown> | null | undefined): string {
  if (!params) return '—'
  try {
    return JSON.stringify(params)
  } catch {
    return String(params)
  }
}

export function equipmentName(
  equipmentId: string,
  equipmentMap: Map<string, { id: string; name: string; identifier: string }>,
): string {
  const eq = equipmentMap.get(equipmentId)
  return eq ? `${eq.name}（${eq.identifier}）` : equipmentId
}
