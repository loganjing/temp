import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, errorText } from '../platform/api-client'
import { useCan } from '../platform/permissions'
import { Badge, Card, EmptyState, ErrorBox, Loading, StatusBadge, useResource } from '../components/ui'
import { PARCEL_STATUS_LABELS, displayDateTime, displayMoney, displayPercent } from '../lib/format'
import type { Paged, Parcel } from '../types'

type UserRow = { id: string; username: string; displayName: string }

const PAGE_SIZE = 20

/** M01 地块台账：搜索/筛选/分页 + 新建 + 受限删除（processing 且无正式化方案才允许）。 */
export default function LedgerPage() {
  const can = useCan()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [region, setRegion] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [completed, setCompleted] = useState('')
  const [page, setPage] = useState(1)
  const [owners, setOwners] = useState<UserRow[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (query.trim()) params.set('query', query.trim())
    if (status) params.set('status', status)
    if (region.trim()) params.set('region', region.trim())
    if (ownerId) params.set('ownerId', ownerId)
    if (completed) params.set('completed', completed)
    return `/api/parcels?${params.toString()}`
  }, [query, status, region, ownerId, completed, page])
  const parcels = useResource<Paged<Parcel>>(() => apiRequest(listUrl), [listUrl])

  // 负责人筛选依赖用户列表（契约 /api/users 需 users:manage；无权限时隐藏该筛选）。
  const canListUsers = can('users:manage')
  if (canListUsers && owners.length === 0) {
    void apiRequest<Paged<UserRow>>('/api/users')
      .then((result) => setOwners(result.items))
      .catch(() => setOwners([]))
  }

  const createParcel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest('/api/parcels', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) })
      form.reset()
      setNotice('地块已创建，可进入工作台补充档案与附件。')
      parcels.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const deleteParcel = async (parcel: Parcel) => {
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}`, { method: 'DELETE' })
      setNotice(`已删除地块「${parcel.name}」。`)
      parcels.reload()
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  const data = parcels.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="stack">
      <div className="topbar">
        <h1>地块台账</h1>
        <p className="hint">所有测算与方案的归属中心（机会池）。{canListUsers ? '' : '负责人筛选需用户管理权限。'}</p>
      </div>

      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {can('parcels:write') && (
        <Card title="新建地块机会">
          <form className="form-grid" onSubmit={(event) => void createParcel(event)}>
            <label>地块名称 *<input name="name" required maxLength={200} /></label>
            <label>州<input name="state" maxLength={100} /></label>
            <label>城市<input name="city" maxLength={100} /></label>
            <label>地区<input name="district" maxLength={100} /></label>
            <label>土地面积（sqft）<input name="areaSqft" inputMode="decimal" /></label>
            <button disabled={busy}>{busy ? '保存中…' : '新建地块'}</button>
          </form>
        </Card>
      )}

      <Card title={`地块列表${data ? `（${data.total}）` : ''}`}>
        <div className="toolbar">
          <label className="search">名称搜索<input value={query} onChange={(event) => { setQuery(event.currentTarget.value); setPage(1) }} placeholder="按名称模糊搜索" /></label>
          <label className="field">状态
            <select value={status} onChange={(event) => { setStatus(event.currentTarget.value); setPage(1) }}>
              <option value="">全部</option>
              {Object.entries(PARCEL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">地区<input value={region} onChange={(event) => { setRegion(event.currentTarget.value); setPage(1) }} placeholder="州/市/区" /></label>
          {canListUsers && (
            <label className="field">负责人
              <select value={ownerId} onChange={(event) => { setOwnerId(event.currentTarget.value); setPage(1) }}>
                <option value="">全部</option>
                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}
              </select>
            </label>
          )}
          <label className="field">完成状态
            <select value={completed} onChange={(event) => { setCompleted(event.currentTarget.value); setPage(1) }}>
              <option value="">全部</option>
              <option value="true">仅已完成</option>
              <option value="false">仅未完成</option>
            </select>
          </label>
        </div>

        {parcels.busy && !data && <Loading />}
        <ErrorBox cause={parcels.error} />
        {data && data.items.length === 0 && <EmptyState text="暂无地块，请新建地块机会开始评估。" />}
        {data && data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>地块</th><th>地区</th><th>面积(sqft)</th><th>状态</th><th>采用方案</th>
                  <th className="num">预计 GDV</th><th className="num">TDC</th><th className="num">PBT</th><th className="num">PM</th>
                  <th>负责人</th><th>更新时间</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((parcel) => (
                  <tr key={parcel.id}>
                    <td>
                      <strong title={parcel.name}>{parcel.name}</strong>
                      {parcel.internalNo && <span className="subtext">{parcel.internalNo}</span>}
                    </td>
                    <td>{[parcel.state, parcel.city, parcel.district].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="num">{displayMoney(parcel.areaSqft)}</td>
                    <td><StatusBadge status={parcel.status} label={PARCEL_STATUS_LABELS[parcel.status]} /></td>
                    <td className="mono nowrap" title={parcel.adoptedPlanId ?? ''}>{parcel.adoptedPlanId ?? '—'}</td>
                    <td className="num">{displayMoney(parcel.summary.gdv)}</td>
                    <td className="num">{displayMoney(parcel.summary.tdc)}</td>
                    <td className="num">{displayMoney(parcel.summary.pbt)}</td>
                    <td className="num">
                      {parcel.summaryIncomplete && <Badge tone="warning">摘要未完成</Badge>}
                      {!parcel.summaryIncomplete && displayPercent(parcel.summary.pm)}
                    </td>
                    <td>{parcel.ownerName ?? '—'}</td>
                    <td className="nowrap">{displayDateTime(parcel.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="tab-link" to={`/parcels/${encodeURIComponent(parcel.id)}/overview`}>进入工作台</Link>
                        {can('parcels:write') && parcel.status === 'processing' && (
                          <button className="secondary" onClick={() => void deleteParcel(parcel)}>删除</button>
                        )}
                      </div>
                    </td>
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
