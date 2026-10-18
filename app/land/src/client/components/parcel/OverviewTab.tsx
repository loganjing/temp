import { useState, type FormEvent } from 'react'
import { apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Card, EmptyState, ErrorBox, KeyValue, Loading, StatusBadge, useResource } from '../ui'
import { PARCEL_STATUS_LABELS, displayDateTime, displayMoney } from '../../lib/format'
import type { AuditEntry, Parcel, ParcelStatus } from '../../types'

/** 契约状态机：processing→in_review|abandoned；in_review→processing|completed；completed→processing；abandoned 终态。 */
const TRANSITIONS: Record<ParcelStatus, readonly ParcelStatus[]> = {
  processing: ['in_review', 'abandoned'],
  in_review: ['processing', 'completed'],
  completed: ['processing'],
  abandoned: [],
}

export default function OverviewTab({ parcel, reload }: { parcel: Parcel; reload: () => void }) {
  const can = useCan()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const audit = useResource<{ items: AuditEntry[] }>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/audit`))

  const submitBase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
      setNotice('台账基础字段已更新。')
      reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const submitStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest<{ status: ParcelStatus }>(`/api/parcels/${encodeURIComponent(parcel.id)}/status`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setNotice(`状态已变更为 ${PARCEL_STATUS_LABELS[result.status] ?? result.status}，并已留痕。`)
      form.reset()
      reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const allowed = TRANSITIONS[parcel.status]
  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <Card title="基础信息">
        <KeyValue
          rows={[
            ['地块名称', parcel.name],
            ['内部编号', parcel.internalNo ?? '—'],
            ['州 / 城市 / 地区', [parcel.state, parcel.city, parcel.district].filter(Boolean).join(' / ') || '—'],
            ['土地面积（sqft）', displayMoney(parcel.areaSqft)],
            ['当前状态', <StatusBadge key="status" status={parcel.status} label={PARCEL_STATUS_LABELS[parcel.status]} />],
            ['负责人', parcel.ownerName ?? '—'],
            ['采用方案', <span key="adopted" className="mono">{parcel.adoptedPlanId ?? '—'}</span>],
            ['当前阶段备注', parcel.currentStageNote ?? '—'],
            ['更新时间', displayDateTime(parcel.updatedAt)],
          ]}
        />
        {can('parcels:write') && (
          <details className="expander">
            <summary>编辑台账基础字段</summary>
            <form className="form-grid" onSubmit={(event) => void submitBase(event)}>
              <label>地块名称<input name="name" defaultValue={parcel.name} required maxLength={200} /></label>
              <label>土地面积（sqft）<input name="areaSqft" defaultValue={parcel.areaSqft ?? ''} inputMode="decimal" /></label>
              <label>负责人 ID<input name="ownerId" defaultValue={parcel.ownerId ?? ''} placeholder="留空维持不变（需完整用户 ID）" /></label>
              <button disabled={busy}>保存</button>
            </form>
          </details>
        )}
      </Card>

      <Card title="状态变更（契约状态机）">
        {can('parcels:write') ? (
          allowed.length === 0 ? (
            <EmptyState text="该地块已放弃/终止（终态），状态不可再变更。" />
          ) : (
            <form className="form-grid" onSubmit={(event) => void submitStatus(event)}>
              <label>目标状态
                <select name="to" defaultValue={allowed[0]}>
                  {allowed.map((status) => <option key={status} value={status}>{PARCEL_STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              <label>变更原因 *<input name="reason" required maxLength={2000} placeholder="如：完成评估、决策放弃、退回补充资料" /></label>
              <label>备注<input name="note" maxLength={2000} /></label>
              <button disabled={busy}>{busy ? '提交中…' : '提交状态变更'}</button>
              <p className="hint">
                变更为「已完成」必须已关联采用方案（审批通过自动关联）；每次变更记录操作人、原/新状态与原因。
                {parcel.status === 'processing' && ' processing 可转审批中或放弃。'}
                {parcel.status === 'in_review' && ' 审批中可退回处理中（如退回重做）或完成。'}
                {parcel.status === 'completed' && ' 已完成仅可重新打开为处理中（重新评估）。'}
              </p>
            </form>
          )
        ) : (
          <p className="hint">无 parcels:write 权限，仅可查看。</p>
        )}
      </Card>

      <Card title="审计留痕（地块与方案事件）">
        {audit.busy && !audit.data && <Loading />}
        <ErrorBox cause={audit.error} />
        {audit.data && audit.data.items.length === 0 && <EmptyState text="暂无审计事件。" />}
        {audit.data && audit.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>摘要</th></tr></thead>
              <tbody>
                {audit.data.items.map((event) => (
                  <tr key={event.id}>
                    <td className="nowrap">{displayDateTime(event.at)}</td>
                    <td className="mono nowrap" title={event.actor ?? ''}>{event.actor ?? '—'}</td>
                    <td className="nowrap">{event.action}</td>
                    <td className="mono nowrap" title={event.objectId ?? ''}>{event.objectType ?? '—'}</td>
                    <td>{event.summary ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
