import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Card, EmptyState, ErrorBox, Loading, StatusBadge, useResource } from '../ui'
import { COST_CATEGORY_LABELS, PLAN_KIND_LABELS, PLAN_STATUS_LABELS, displayDateTime, displayMoney, displayPercent } from '../../lib/format'
import type { CompareResponse, ParcelDetail, PlanMeta } from '../../types'
import PlanEditor from './PlanEditor'

const PERCENT_DIMENSIONS = new Set(['效率(不含车位)', '利润率 PM'])
const MONEY_DIMENSIONS = new Set(['GDV', '净 GDV', 'TDC', '税前利润 PBT', '单位 TDC'])

function dimensionLabel(dimension: string): string {
  return dimension.startsWith('成本-') ? `成本：${COST_CATEGORY_LABELS[dimension.slice(3)] ?? dimension.slice(3)}` : dimension
}

function compareCell(dimension: string, value: string | number | null): string {
  if (value === null) return '—'
  if (PERCENT_DIMENSIONS.has(dimension)) return displayPercent(value)
  if (MONEY_DIMENSIONS.has(dimension) || dimension.startsWith('成本-')) return displayMoney(value)
  return String(value)
}

/** M06/M07 方案测算：基准/候选方案列表、新建、≥2 方案并行比较与 ?plan= 深链编辑（AC-04）。 */
export default function PlansTab({ parcel, reload: reloadParcel }: { parcel: ParcelDetail; reload: () => void }) {
  const can = useCan()
  const editable = can('plans:write')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('plan') ?? ''
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [comparison, setComparison] = useState<CompareResponse | null>(null)
  const [compareError, setCompareError] = useState('')
  const [createError, setCreateError] = useState('')
  const [busy, setBusy] = useState(false)

  const plans = useResource<{ items: PlanMeta[] }>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/plans`), [parcel.id])

  const selectPlan = (planId: string) => {
    setComparison(null)
    setCompareError('')
    setCompareIds([])
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (planId === '') next.delete('plan')
        else next.set('plan', planId)
        return next
      },
      { replace: false },
    )
  }

  const createPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (name === '') return
    setBusy(true)
    setCreateError('')
    try {
      const created = await apiRequest<{ id: string }>(`/api/parcels/${encodeURIComponent(parcel.id)}/plans`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      form.reset()
      plans.reload()
      selectPlan(created.id)
    } catch (cause) {
      setCreateError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const runCompare = async () => {
    setBusy(true)
    setCompareError('')
    try {
      setComparison(await apiRequest<CompareResponse>('/api/plans/compare', { method: 'POST', body: JSON.stringify({ planIds: compareIds }) }))
    } catch (cause) {
      setCompareError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (selectedId !== '') {
    return (
      <div className="stack">
        <div className="row-actions">
          <Link className="tab-link" to={`/parcels/${encodeURIComponent(parcel.id)}/plans`}>← 返回方案列表</Link>
        </div>
        <PlanEditor planId={selectedId} parcel={parcel} reloadList={plans.reload} selectPlan={selectPlan} reloadParcel={reloadParcel} />
      </div>
    )
  }

  return (
    <div className="stack">
      {editable && (
        <Card title="新建基准方案">
          <p className="hint">仅提交名称：初始面积口径由服务端按地块所在州解析默认版本；期次、产品、成本在编辑器中维护。</p>
          <form className="form-grid" onSubmit={(event) => void createPlan(event)}>
            <label>方案名称 *<input name="name" required maxLength={200} /></label>
            <button disabled={busy}>{busy ? '创建中…' : '创建基准方案'}</button>
          </form>
          {createError && <p role="alert" className="error">{createError}</p>}
        </Card>
      )}

      <Card
        title={`方案列表（${plans.data?.items.length ?? 0}）`}
        actions={
          <button className="secondary" disabled={busy || compareIds.length < 2} onClick={() => void runCompare()}>
            比较所选（{compareIds.length}）
          </button>
        }
      >
        {plans.busy && !plans.data && <Loading />}
        <ErrorBox cause={plans.error} />
        {plans.data && plans.data.items.length === 0 && <EmptyState text="暂无方案：先创建基准方案。" />}
        {plans.data && plans.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>比较</th><th>方案</th><th>类型</th><th>状态</th><th className="num">期次</th><th>假设标签</th><th>负责人</th><th>更新时间</th></tr>
              </thead>
              <tbody>
                {plans.data.items.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`比较 ${plan.name}`}
                        checked={compareIds.includes(plan.id)}
                        onChange={(event) => setCompareIds((prev) => (event.currentTarget.checked ? [...prev, plan.id] : prev.filter((id) => id !== plan.id)))}
                      />
                    </td>
                    <td>
                      <Link to={`/parcels/${encodeURIComponent(parcel.id)}/plans?plan=${encodeURIComponent(plan.id)}`}><strong>{plan.name}</strong></Link>
                      <span className="subtext mono">{plan.id}</span>
                    </td>
                    <td>{PLAN_KIND_LABELS[plan.kind] ?? plan.kind}</td>
                    <td><StatusBadge status={plan.status} label={PLAN_STATUS_LABELS[plan.status] ?? plan.status} /></td>
                    <td className="num">{plan.phaseCount}</td>
                    <td>
                      {plan.assumptionTags.length === 0
                        ? '—'
                        : <div className="chips">{plan.assumptionTags.map((tag) => <span key={tag} className="badge badge-neutral">{tag}</span>)}</div>}
                    </td>
                    <td className="mono">{plan.ownerId}</td>
                    <td className="nowrap">{displayDateTime(plan.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {compareError && <p role="alert" className="error">{compareError}</p>}
        {plans.data && <p className="hint">勾选两个及以上方案后点击“比较所选”，行级并行对比维度含面积口径、产品组合、九类成本与利润指标。</p>}
      </Card>

      {comparison && (
        <Card title="方案比较（同一地块并行对比）">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>维度</th>
                  {comparison.plans.map((plan) => (
                    <th key={plan.id} className="num">
                      {plan.name}
                      <span className="subtext">{PLAN_STATUS_LABELS[plan.status] ?? plan.status}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.dimension}>
                    <td>{dimensionLabel(row.dimension)}</td>
                    {row.values.map((value, index) => <td key={index} className="num">{compareCell(row.dimension, value)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
