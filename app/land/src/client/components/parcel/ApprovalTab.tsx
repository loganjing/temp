import { useMemo, useState, type FormEvent } from 'react'
import { apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Badge, Banner, Card, EmptyState, ErrorBox, KeyValue, Loading, StatusBadge, useResource } from '../ui'
import { DECISION_ACTION_LABELS, PLAN_KIND_LABELS, PLAN_STATUS_LABELS, displayDateTime, displayMoney, displayPercent } from '../../lib/format'
import type { AuditEntry, DecisionRecord, ParcelDetail, PlanMeta, SubmissionDetail } from '../../types'

const SUBMISSION_STATUS_LABELS: Record<string, string> = { pending: '待审批', approved: '已通过', returned: '已退回' }
const ACTION_LABELS: Record<string, string> = { approve: '通过并采用', return: '退回' }

/** 从正式化快照 results（unknown 形状）防御性读取单个 decimal 指标。 */
function snapshotMetric(results: unknown, key: string): string | null {
  if (typeof results !== 'object' || results === null) return null
  const profit = (results as Record<string, unknown>).profit
  if (typeof profit !== 'object' || profit === null) return null
  const value = (profit as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

/** M08 审批流：提交正式化方案 → 通过/采用冻结或退回（退回必填理由）；决策记录沉淀（AC-08）。 */
export default function ApprovalTab({ parcel, reload: reloadParcel }: { parcel: ParcelDetail; reload: () => void }) {
  const can = useCan()
  const canCreate = can('submissions:create')
  const canApprove = can('submissions:approve')
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const plans = useResource<{ items: PlanMeta[] }>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/plans`), [parcel.id])
  // 无 submission 列表端点：提交历史来自审计事件 submission.created（objectId 即 submissionId，occurred_at 倒序）。
  const audit = useResource<{ items: AuditEntry[] }>(
    () => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/audit?action=submission.created`),
    [parcel.id],
  )
  const submissions = useMemo(() => {
    const rows: Array<{ id: string; at: string; summary: string | null; actor: string | null }> = []
    for (const entry of audit.data?.items ?? []) {
      if (entry.objectId && !rows.some((row) => row.id === entry.objectId)) {
        rows.push({ id: entry.objectId, at: entry.at, summary: entry.summary, actor: entry.actor })
      }
    }
    return rows
  }, [audit.data])

  const detail = useResource<SubmissionDetail | null>(
    () => (selectedId === '' ? Promise.resolve(null) : apiRequest(`/api/submissions/${encodeURIComponent(selectedId)}`)),
    [selectedId],
  )
  const decision = useResource<DecisionRecord>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/decision-record`), [parcel.id])

  const formalizedPlans = (plans.data?.items ?? []).filter((plan) => plan.status === 'formalized')

  const createSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const planIds = formalizedPlans.filter((plan) => data.get(`plan-${plan.id}`) === 'on').map((plan) => plan.id)
    if (planIds.length === 0) {
      setError('请勾选至少一个已正式化的方案。')
      return
    }
    const note = String(data.get('note') ?? '').trim()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await apiRequest<{ id: string }>(`/api/parcels/${encodeURIComponent(parcel.id)}/submissions`, {
        method: 'POST',
        body: JSON.stringify({ planIds, ...(note === '' ? {} : { note }) }),
      })
      form.reset()
      setNotice('已提交审批；方案进入审批中。')
      setSelectedId(created.id)
      audit.reload()
      plans.reload()
      reloadParcel()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const approve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const selectedPlanId = String(data.get('selectedPlanId') ?? '')
    const reason = String(data.get('reason') ?? '').trim()
    if (selectedPlanId === '') {
      setError('请选择要采用的方案。')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/submissions/${encodeURIComponent(selectedId)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ selectedPlanId, ...(reason === '' ? {} : { reason }) }),
      })
      form.reset()
      setNotice('审批已通过：选中方案采用冻结，其余方案未采用。')
      detail.reload()
      plans.reload()
      audit.reload()
      reloadParcel()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const returnSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const reason = String(new FormData(form).get('reason') ?? '').trim()
    if (reason === '') {
      setError('退回必须填写理由。')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/submissions/${encodeURIComponent(selectedId)}/return`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      form.reset()
      setNotice('已退回：方案回到可编辑状态，地块回到处理中。')
      detail.reload()
      plans.reload()
      audit.reload()
      reloadParcel()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <Banner tone="info">
        审批流：方案正式化后提交审批（方案进入审批中）→ 管理层通过并采用（选中方案冻结快照，其余未采用，地块完成）或退回（必填理由，方案退回可编辑）。
      </Banner>

      {canCreate && (
        <Card title="提交审批">
          {formalizedPlans.length === 0 ? (
            <EmptyState text="当前没有已正式化（formalized）状态的方案可提交。" />
          ) : (
            <form className="stack" onSubmit={(event) => void createSubmission(event)}>
              <div className="stack">
                {formalizedPlans.map((plan) => (
                  <label key={plan.id} className="role-check">
                    <input type="checkbox" name={`plan-${plan.id}`} />
                    <span>{plan.name} · {PLAN_KIND_LABELS[plan.kind] ?? plan.kind}</span>
                    <StatusBadge status={plan.status} label={PLAN_STATUS_LABELS[plan.status] ?? plan.status} />
                  </label>
                ))}
              </div>
              <label>提交说明（可选）<textarea name="note" maxLength={2000} /></label>
              <button disabled={busy}>{busy ? '提交中…' : '提交审批'}</button>
            </form>
          )}
        </Card>
      )}

      <Card title="提交历史">
        {audit.busy && !audit.data && <Loading />}
        <ErrorBox cause={audit.error} />
        {audit.data && submissions.length === 0 && <EmptyState text="暂无提交记录。" />}
        {submissions.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>提交编号</th><th>提交时间</th><th>摘要</th><th>提交人</th><th></th></tr></thead>
              <tbody>
                {submissions.map((row) => (
                  <tr key={row.id} className={row.id === selectedId ? 'selected' : ''}>
                    <td className="mono">{row.id}</td>
                    <td className="nowrap">{displayDateTime(row.at)}</td>
                    <td title={row.summary ?? ''}>{row.summary ?? '—'}</td>
                    <td className="mono">{row.actor ?? '—'}</td>
                    <td><button className="secondary" onClick={() => setSelectedId(row.id)}>查看</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {audit.data && <p className="hint">提交历史来自审计事件（submission.created）；查看需要 audit:read 权限或为地块/方案负责人。</p>}
      </Card>

      {selectedId !== '' && (
        <Card title="提交详情">
          {detail.busy && !detail.data && <Loading />}
          <ErrorBox cause={detail.error} />
          {detail.data && (
            <div className="stack">
              <KeyValue
                rows={[
                  ['状态', <StatusBadge status={detail.data.status} label={SUBMISSION_STATUS_LABELS[detail.data.status] ?? detail.data.status} />],
                  ['提交人', detail.data.submittedBy],
                  ['提交时间', displayDateTime(detail.data.submittedAt)],
                  ['提交说明', detail.data.note ?? '—'],
                  ['退回次数', String(detail.data.returnCount)],
                ]}
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>方案</th><th>类型</th><th>状态</th><th>假设标签</th><th className="num">PM</th><th className="num">PBT</th><th>正式化时间</th></tr>
                  </thead>
                  <tbody>
                    {detail.data.plans.map((plan) => {
                      const pm = plan.formalizedSnapshot ? snapshotMetric(plan.formalizedSnapshot.results, 'pm') : null
                      const pbt = plan.formalizedSnapshot ? snapshotMetric(plan.formalizedSnapshot.results, 'pbt') : null
                      return (
                        <tr key={plan.id}>
                          <td><strong>{plan.name}</strong><span className="subtext mono">{plan.id}</span></td>
                          <td>{PLAN_KIND_LABELS[plan.kind] ?? plan.kind}</td>
                          <td><StatusBadge status={plan.status} label={PLAN_STATUS_LABELS[plan.status] ?? plan.status} /></td>
                          <td>
                            {plan.assumptionTags.length === 0
                              ? '—'
                              : <div className="chips">{plan.assumptionTags.map((tag) => <span key={tag} className="badge badge-neutral">{tag}</span>)}</div>}
                          </td>
                          <td className="num">{pm ? displayPercent(pm) : '—'}</td>
                          <td className="num">{pbt ? displayMoney(pbt) : '—'}</td>
                          <td className="nowrap">{plan.formalizedSnapshot ? displayDateTime(plan.formalizedSnapshot.formalizedAt) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {detail.data.actions.length > 0 && (
                <div>
                  <h4>审批动作</h4>
                  <ul>
                    {detail.data.actions.map((action) => (
                      <li key={action.id}>
                        {ACTION_LABELS[action.action] ?? action.action} · {action.actor} · {displayDateTime(action.at)}
                        {action.selectedPlanId && <span>（采用方案 {action.selectedPlanId}）</span>}
                        {action.reason && <span>：{action.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.data.status === 'pending' && canApprove && (
                <form className="stack" onSubmit={(event) => void approve(event)}>
                  <h4>通过并采用</h4>
                  <p className="hint">选中方案冻结为采用（adopted），其余方案标记未采用，地块进入已完成。</p>
                  <div className="stack">
                    {detail.data.plans.map((plan) => {
                      const pm = plan.formalizedSnapshot ? snapshotMetric(plan.formalizedSnapshot.results, 'pm') : null
                      return (
                        <label key={plan.id} className="role-check">
                          <input type="radio" name="selectedPlanId" value={plan.id} required />
                          <span>{plan.name}</span>
                          {pm !== null && <Badge tone="info">PM {displayPercent(pm)}</Badge>}
                        </label>
                      )
                    })}
                  </div>
                  <label>审批理由（可选）<textarea name="reason" maxLength={2000} /></label>
                  <button disabled={busy}>{busy ? '处理中…' : '通过并采用'}</button>
                </form>
              )}

              {detail.data.status === 'pending' && canApprove && (
                <form className="stack" onSubmit={(event) => void returnSubmission(event)}>
                  <h4>退回</h4>
                  <label>退回理由 *<textarea name="reason" required maxLength={2000} /></label>
                  <button className="danger" disabled={busy}>{busy ? '处理中…' : '退回'}</button>
                </form>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="决策记录">
        {decision.busy && !decision.data && <Loading />}
        <ErrorBox cause={decision.error} />
        {decision.data && (
          <KeyValue
            rows={[
              ['决策动作', decision.data.action ? (DECISION_ACTION_LABELS[decision.data.action] ?? decision.data.action) : '—'],
              ['决策理由', decision.data.reason ?? '—'],
              ['决策时间', decision.data.decidedAt ? displayDateTime(decision.data.decidedAt) : '—'],
              ['决策人', decision.data.decidedBy ?? '—'],
              ['采用方案', decision.data.adoptedPlanId ?? '—'],
              ['交接对象', decision.data.handoffTo ?? '—'],
            ]}
          />
        )}
      </Card>
    </div>
  )
}
