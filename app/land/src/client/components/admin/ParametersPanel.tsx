import { useMemo, useState, type FormEvent } from 'react'
import { apiRequest, errorText } from '../../platform/api-client'
import { Card, EmptyState, ErrorBox, Loading, useResource } from '../ui'
import { PARAMETER_KIND_LABELS, displayDateTime } from '../../lib/format'
import type { Paged, ParameterSet } from '../../types'

const PAGE_SIZE = 20

/** 空文本按 null 提交；JSON 字段须为对象，失败时客户端拦截并中文报错。 */
function parseJsonInput(text: string, field: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`${field} 必须是合法的 JSON 对象`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${field} 必须是 JSON 对象（如 {"efficiencyDefault": "0.8"}）`)
  }
  return parsed as Record<string, unknown>
}

/** 版本化参数面板：面积口径/成本套餐/政策等参数的查询与发布（同 kind+region 版本自动递增）。 */
export default function ParametersPanel() {
  const [kind, setKind] = useState('')
  const [region, setRegion] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (kind) params.set('kind', kind)
    if (region.trim()) params.set('region', region.trim())
    return `/api/parameters?${params.toString()}`
  }, [kind, region, page])
  const parameters = useResource<Paged<ParameterSet>>(() => apiRequest(listUrl), [listUrl])

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    let scope: Record<string, unknown> | null = null
    let content: Record<string, unknown> | null = null
    try {
      scope = parseJsonInput(String(data.get('scope') ?? ''), 'scope')
      content = parseJsonInput(String(data.get('content') ?? ''), 'content')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JSON 解析失败')
      return
    }
    if (content === null) {
      setError('content 为必填 JSON 对象。')
      return
    }
    const effectiveAtRaw = String(data.get('effectiveAt') ?? '')
    if (effectiveAtRaw === '') {
      setError('请填写生效时间。')
      return
    }
    const regionValue = String(data.get('region') ?? '').trim()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest('/api/parameters', {
        method: 'POST',
        body: JSON.stringify({
          kind: String(data.get('kind') ?? ''),
          ...(regionValue === '' ? {} : { region: regionValue }),
          effectiveAt: new Date(effectiveAtRaw).toISOString(),
          ...(scope === null ? {} : { scope }),
          content,
          changeNote: String(data.get('changeNote') ?? ''),
        }),
      })
      form.reset()
      setNotice('参数版本已发布。')
      parameters.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const data = parameters.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <Card title="发布参数版本">
        <p className="hint">同一 kind+region 的版本号自动递增；effectiveAt ≤ 当前时间即立即生效，历史版本不可修改（只读）。</p>
        <form className="form-grid" onSubmit={(event) => void publish(event)}>
          <label>类型 *
            <select name="kind" required defaultValue="area-convention">
              {Object.entries(PARAMETER_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>区域（可选）<input name="region" maxLength={100} placeholder="如 JHR" /></label>
          <label>生效时间 *<input name="effectiveAt" type="datetime-local" required /></label>
          <label>变更说明 *<input name="changeNote" required maxLength={500} /></label>
          <label className="span-2">scope（可选 JSON 对象）<textarea name="scope" placeholder='如 {"region": "JHR"}' /></label>
          <label className="span-2">content *（JSON 对象）<textarea name="content" required placeholder='如 {"convention": "GFA 口径", "efficiencyDefault": "0.8"}' /></label>
          <button disabled={busy}>{busy ? '发布中…' : '发布参数'}</button>
        </form>
      </Card>

      <Card title={`参数版本${data ? `（${data.total}）` : ''}`}>
        <div className="toolbar">
          <label className="field">类型
            <select value={kind} onChange={(event) => { setKind(event.currentTarget.value); setPage(1) }}>
              <option value="">全部</option>
              {Object.entries(PARAMETER_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">区域<input value={region} onChange={(event) => { setRegion(event.currentTarget.value); setPage(1) }} placeholder="精确匹配" /></label>
        </div>

        {parameters.busy && !data && <Loading />}
        <ErrorBox cause={parameters.error} />
        {data && data.items.length === 0 && <EmptyState text="暂无参数版本。" />}
        {data && data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>类型</th><th>区域</th><th className="num">版本</th><th>生效时间</th><th>变更说明</th><th>content</th><th>创建时间</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{PARAMETER_KIND_LABELS[item.kind] ?? item.kind}</td>
                    <td>{item.region ?? '—'}</td>
                    <td className="num">v{item.version}</td>
                    <td className="nowrap">{displayDateTime(item.effectiveAt)}</td>
                    <td title={item.changeNote}>{item.changeNote}</td>
                    <td>
                      <details className="expander">
                        <summary>查看</summary>
                        <pre className="ai-content">{JSON.stringify(item.content, null, 2)}</pre>
                      </details>
                    </td>
                    <td className="nowrap">{displayDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <div className="pagination">
            <span>第 {data.page} / {totalPages} 页 · 共 {data.total} 条</span>
            <div className="row-actions">
              <button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button>
              <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
