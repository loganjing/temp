import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiRequestError, apiDownload, apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Banner, Card, EmptyState, ErrorBox, KeyValue, Loading, StatusBadge, useResource } from '../ui'
import {
  ATTACHMENT_CATEGORY_LABELS, CONFIDENCE_LABELS, COST_CATEGORY_LABELS, DECISION_ACTION_LABELS, FORMAT_LABELS, LAYER_LABELS,
  LISTING_STATUS_LABELS, PLAN_KIND_LABELS, PLAN_STATUS_LABELS, REPORT_SECTION_LABELS, displayDateTime, displayMoney, displayPercent,
} from '../../lib/format'
import type { Dashboard, HandoffLatest, ParcelDetail, ReportSection } from '../../types'

type Row = Record<string, unknown>

const asRecord = (value: unknown): Row | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : null)
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const asText = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '—')
const money = (value: unknown): string => displayMoney(typeof value === 'string' || typeof value === 'number' ? value : null)

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

/** 报告 section 的防御性渲染：字段级契约由服务端保证，前端只做展示转换。 */
function ReportSectionView({ section }: { section: ReportSection }) {
  const data = asRecord(section.data) ?? {}
  const title = REPORT_SECTION_LABELS[section.key] ?? section.key
  switch (section.key) {
    case 'conclusion':
      return (
        <Card title={title}>
          <KeyValue
            rows={[
              ['决策建议', typeof data.recommendation === 'string' ? (DECISION_ACTION_LABELS[data.recommendation] ?? data.recommendation) : '—'],
              ['决策理由', asText(data.reason)],
              ['决策时间', typeof data.decidedAt === 'string' ? displayDateTime(data.decidedAt) : '—'],
              ['信息层', typeof data.layer === 'string' ? (LAYER_LABELS[data.layer] ?? data.layer) : '—'],
              ['测算完成', data.incomplete === true ? '否（尚无正式化测算结果）' : '是'],
            ]}
          />
        </Card>
      )
    case 'site-overview': {
      const checklist = asList(data.checklist)
      const pending = checklist.filter((entry) => asRecord(entry)?.status === 'pending').length
      return (
        <Card title={title}>
          <KeyValue
            rows={[
              ['地块名称', asText(data.name)],
              ['州/区域', asText(data.state)],
              ['土地面积(sqft)', money(data.areaSqft)],
              ['产权', asText(data.tenure)],
              ['规划用途', asText(data.plannedUse)],
              ['地主报价', money(data.vendorAskingPrice)],
              ['付款条件', asText(data.paymentTerms)],
              ['信息层', typeof data.layer === 'string' ? (LAYER_LABELS[data.layer] ?? data.layer) : '—'],
              ['核查项', `${checklist.length} 项（待确认 ${pending} 项）`],
            ]}
          />
        </Card>
      )
    }
    case 'location': {
      const location = asRecord(data.location)
      const view = asRecord(data.savedMapView)
      return (
        <Card title={title}>
          <KeyValue
            rows={[
              ['坐标', location ? `${asText(location.lat)}, ${asText(location.lng)}` : '—'],
              ['边界已录入', data.boundaryIncluded === true ? '是' : '否'],
              ['最近保存视图', view ? asText(view.name) : '—'],
              ['视图时间', view && typeof view.snapshotAt === 'string' ? displayDateTime(view.snapshotAt) : '—'],
              ['地图标记', `${asList(data.markers).length} 个`],
            ]}
          />
        </Card>
      )
    }
    case 'market': {
      const landRefs = asList(data.landRefs)
      const comps = asList(data.comps)
      return (
        <Card title={title}>
          <p className="hint">{asText(data.note)}</p>
          {landRefs.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>土地参考项目</th><th className="num">成交价</th><th className="num">单价/sqft</th><th>挂牌状态</th><th>可信度</th></tr></thead>
                <tbody>
                  {landRefs.map((entry, index) => {
                    const ref = asRecord(entry) ?? {}
                    return (
                      <tr key={index}>
                        <td><strong>{asText(ref.projectName)}</strong></td>
                        <td className="num">{money(ref.dealPrice)}</td>
                        <td className="num">{money(ref.pricePerSqft)}</td>
                        <td>{typeof ref.listingStatus === 'string' ? (LISTING_STATUS_LABELS[ref.listingStatus] ?? ref.listingStatus) : '—'}</td>
                        <td>{typeof ref.confidence === 'string' ? (CONFIDENCE_LABELS[ref.confidence] ?? ref.confidence) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {comps.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>竞品项目</th><th>业态</th><th className="num">报价</th><th className="num">单价/sqft</th><th>可信度</th></tr></thead>
                <tbody>
                  {comps.map((entry, index) => {
                    const comp = asRecord(entry) ?? {}
                    return (
                      <tr key={index}>
                        <td><strong>{asText(comp.projectName)}</strong></td>
                        <td>{typeof comp.format === 'string' ? (FORMAT_LABELS[comp.format] ?? comp.format) : '—'}</td>
                        <td className="num">{money(comp.askingPrice)}</td>
                        <td className="num">{money(comp.pricePerSqft)}</td>
                        <td>{typeof comp.confidence === 'string' ? (CONFIDENCE_LABELS[comp.confidence] ?? comp.confidence) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {landRefs.length === 0 && comps.length === 0 && <EmptyState text="暂无市场研究数据。" />}
        </Card>
      )
    }
    case 'dev-plan': {
      const plan = asRecord(data.plan)
      return (
        <Card title={title}>
          {plan ? (
            <KeyValue
              rows={[
                ['方案名称', asText(plan.name)],
                ['类型', typeof plan.kind === 'string' ? (PLAN_KIND_LABELS[plan.kind] ?? plan.kind) : '—'],
                ['状态', typeof plan.status === 'string' ? (PLAN_STATUS_LABELS[plan.status] ?? plan.status) : '—'],
                ['最新快照', asText(plan.snapshotId)],
                ['假设标签', asList(plan.assumptionTags).length > 0 ? asList(plan.assumptionTags).map((tag) => String(tag)).join(' / ') : '—'],
              ]}
            />
          ) : (
            <EmptyState text="尚无正式化/采用方案。" />
          )}
          <p className="hint">{asText(data.basisNote)}</p>
        </Card>
      )
    }
    case 'financial-summary':
      return (
        <Card title={title}>
          <div className="summary-grid">
            <MetricTile label="GDV" value={money(data.gdv)} />
            <MetricTile label="净 GDV" value={money(data.netGdv)} />
            <MetricTile label="TDC" value={money(data.tdc)} />
            <MetricTile label="税前利润 PBT" value={money(data.pbt)} />
            <MetricTile label="利润率 PM" value={data.pm === null || data.pm === undefined ? '—' : displayPercent(String(data.pm))} />
          </div>
          <p className="hint">{asText(data.basisNote)}</p>
        </Card>
      )
    case 'cost-structure': {
      const byCategory = asList(data.byCategory)
      const pendingItems = asList(data.pendingItems)
      return (
        <Card title={title}>
          {byCategory.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>成本类别</th><th className="num">金额</th></tr></thead>
                <tbody>
                  {byCategory.map((entry, index) => {
                    const row = asRecord(entry) ?? {}
                    return (
                      <tr key={index}>
                        <td>{typeof row.category === 'string' ? (COST_CATEGORY_LABELS[row.category] ?? row.category) : '—'}</td>
                        <td className="num">{money(row.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="暂无成本结构数据。" />
          )}
          {pendingItems.length > 0 && (
            <div className="chips">
              {pendingItems.map((entry, index) => {
                const item = asRecord(entry) ?? {}
                return (
                  <span key={index} className="badge badge-warning">
                    {asText(item.itemName)}（{typeof item.category === 'string' ? (COST_CATEGORY_LABELS[item.category] ?? item.category) : '—'}）待确认
                  </span>
                )
              })}
            </div>
          )}
        </Card>
      )
    }
    case 'sensitivity-risk': {
      const risks = asList(data.risks).map((risk) => (typeof risk === 'string' ? risk : ''))
      return (
        <Card title={title}>
          {risks.length > 0 ? <ul>{risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul> : <EmptyState text="无待确认风险项。" />}
          <p className="hint">{asText(data.sensitivityNote)}</p>
        </Card>
      )
    }
    case 'jv-phasing':
      return <Card title={title}><p>{asText(data.note)}</p></Card>
    case 'recommended-actions': {
      const actions = asList(data.actions)
      return (
        <Card title={title}>
          {actions.length > 0 ? (
            <ul>
              {actions.map((entry, index) => {
                const action = asRecord(entry) ?? {}
                return <li key={index}>{asText(action.action)}（完成标准：{asText(action.doneWhen)}）</li>
              })}
            </ul>
          ) : (
            <EmptyState text="暂无推荐动作。" />
          )}
        </Card>
      )
    }
    default:
      return (
        <Card title={title}>
          <pre className="ai-content">{JSON.stringify(section.data, null, 2)}</pre>
        </Card>
      )
  }
}

/** M09/M10 管理层看板（结论优先）+ 投资报告聚合 + 下游交接快照与受控 CSV 导出（AC-09、AC-10）。 */
export default function DashboardTab({ parcel }: { parcel: ParcelDetail }) {
  const can = useCan()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const dashboard = useResource<Dashboard>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/dashboard`), [parcel.id])
  const report = useResource<{ sections: ReportSection[] }>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/report`), [parcel.id])
  const handoff = useResource<HandoffLatest | null>(
    () =>
      apiRequest<HandoffLatest>(`/api/parcels/${encodeURIComponent(parcel.id)}/handoff/latest`).catch((cause: unknown) => {
        // 404 = 尚未生成过交接快照（正常空态），其余错误照常抛出。
        if (cause instanceof ApiRequestError && cause.status === 404) return null
        throw cause
      }),
    [parcel.id],
  )
  const canHandoff = can('handoff:read')
  const canGenerate = can('parcels:write')
  const handoffReady = parcel.status === 'completed' && parcel.adoptedPlanId !== null

  const generateHandoff = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/handoff`, { method: 'POST' })
      setNotice('交接快照已生成。')
      handoff.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = async () => {
    setError('')
    try {
      await apiDownload(`/api/parcels/${encodeURIComponent(parcel.id)}/handoff/export?format=csv`, `handoff-${parcel.id}.csv`)
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <Card title="管理层结论">
        {dashboard.busy && !dashboard.data && <Loading />}
        <ErrorBox cause={dashboard.error} />
        {dashboard.data && (
          <div className="stack">
            {dashboard.data.conclusion ? (
              <KeyValue
                rows={[
                  ['决策建议', DECISION_ACTION_LABELS[dashboard.data.conclusion.recommendation] ?? dashboard.data.conclusion.recommendation],
                  ['一句话理由', dashboard.data.conclusion.oneLineReason],
                ]}
              />
            ) : (
              <Banner tone="warn">结论尚未形成：需存在决策记录与正式化后的测算结果。</Banner>
            )}
            {dashboard.data.coreMetrics && (
              <div className="summary-grid">
                <MetricTile label="GDV" value={displayMoney(dashboard.data.coreMetrics.gdv)} />
                <MetricTile label="净 GDV" value={displayMoney(dashboard.data.coreMetrics.netGdv)} />
                <MetricTile label="TDC" value={displayMoney(dashboard.data.coreMetrics.tdc)} />
                <MetricTile label="税前利润 PBT" value={displayMoney(dashboard.data.coreMetrics.pbt)} />
                <MetricTile label="利润率 PM" value={displayPercent(dashboard.data.coreMetrics.pm)} />
                <MetricTile label="地价/收入占比" value={displayPercent(dashboard.data.coreMetrics.landCostRatio)} />
              </div>
            )}
            {dashboard.data.recommendedPlan && (
              <p>
                推荐方案：
                <StatusBadge
                  status={dashboard.data.recommendedPlan.status}
                  label={PLAN_STATUS_LABELS[dashboard.data.recommendedPlan.status] ?? dashboard.data.recommendedPlan.status}
                />{' '}
                <strong>{dashboard.data.recommendedPlan.name}</strong>{' '}
                <Link to={`/parcels/${encodeURIComponent(parcel.id)}/plans?plan=${encodeURIComponent(dashboard.data.recommendedPlan.id)}`}>查看方案明细</Link>
              </p>
            )}
            {dashboard.data.incomplete && <p className="hint">数据不完整：结论与指标待方案正式化并审批后补齐。</p>}
          </div>
        )}
      </Card>

      <Card title="关键风险与下一步">
        {dashboard.data && dashboard.data.risks.length > 0 ? (
          <ul>{dashboard.data.risks.map((risk, index) => <li key={index}>{risk.text}</li>)}</ul>
        ) : (
          <EmptyState text="无待确认风险项。" />
        )}
        {dashboard.data && dashboard.data.nextSteps.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>下一步动作</th><th>负责人</th><th>完成标准</th></tr></thead>
              <tbody>
                {dashboard.data.nextSteps.map((step, index) => (
                  <tr key={index}><td>{step.action}</td><td>{step.owner ?? '—'}</td><td>{step.doneWhen}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">相关入口：<Link to={`/parcels/${encodeURIComponent(parcel.id)}/market`}>市场研究依据</Link></p>
      </Card>

      <Card title="投资报告（聚合）">
        {report.busy && !report.data && <Loading />}
        <ErrorBox cause={report.error} />
        {report.data && <div className="stack">{report.data.sections.map((section) => <ReportSectionView key={section.key} section={section} />)}</div>}
      </Card>

      {canHandoff && (
        <Card
          title="下游交接"
          actions={
            <div className="row-actions">
              {canGenerate && (
                <button disabled={busy || !handoffReady} title={handoffReady ? '生成交接快照' : '需地块已完成且有采用方案'} onClick={() => void generateHandoff()}>
                  {busy ? '生成中…' : '生成交接快照'}
                </button>
              )}
              <button className="secondary" disabled={!handoff.data} onClick={() => void exportCsv()}>导出 CSV</button>
            </div>
          }
        >
          {!handoffReady && <p className="hint">生成交接需要地块状态为已完成且存在采用方案（审批通过后自动满足）。</p>}
          {handoff.busy && !handoff.data && <Loading />}
          <ErrorBox cause={handoff.error} />
          {!handoff.busy && handoff.data === null && <EmptyState text="尚未生成交接快照。" />}
          {handoff.data && (
            <div className="stack">
              <KeyValue
                rows={[
                  ['快照编号', handoff.data.id],
                  ['版本', handoff.data.version],
                  ['生成时间', displayDateTime(handoff.data.generatedAt)],
                  ['只读', handoff.data.readOnly ? '是（冻结版本，下游调整须走业务变更）' : '否'],
                ]}
              />
              {(() => {
                const content = handoff.data!.content
                const decisionAction = content?.approvals?.decision?.action
                return (
                  <>
                    {content?.results && (
                      <div className="summary-grid">
                        <MetricTile label="GDV" value={displayMoney(content.results.revenue.gdv)} />
                        <MetricTile label="净 GDV" value={displayMoney(content.results.revenue.netGdv)} />
                        <MetricTile label="TDC" value={displayMoney(content.results.costs.tdc)} />
                        <MetricTile label="税前利润 PBT" value={displayMoney(content.results.profit.pbt)} />
                        <MetricTile label="利润率 PM" value={displayPercent(content.results.profit.pm)} />
                      </div>
                    )}
                    {content?.approvals?.decision && (
                      <p className="hint">
                        审批决策：{decisionAction ? (DECISION_ACTION_LABELS[decisionAction] ?? decisionAction) : '—'}
                        {content.approvals.decision.reason ? ` · ${content.approvals.decision.reason}` : ''}
                      </p>
                    )}
                    {content?.pendingItems && content.pendingItems.length > 0 && (
                      <div className="chips">
                        {content.pendingItems.map((item, index) => (
                          <span key={index} className="badge badge-warning">{item.itemName}（{COST_CATEGORY_LABELS[item.category] ?? item.category}）待确认</span>
                        ))}
                      </div>
                    )}
                    {content?.attachments && content.attachments.length > 0 && (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>附件类别</th><th>文件名</th><th>上传时间</th></tr></thead>
                          <tbody>
                            {content.attachments.map((file) => (
                              <tr key={file.id}>
                                <td>{ATTACHMENT_CATEGORY_LABELS[file.category] ?? file.category}</td>
                                <td>{file.fileName}</td>
                                <td className="nowrap">{displayDateTime(file.uploadedAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {content?.basisNote && <p className="hint">{content.basisNote}</p>}
                  </>
                )
              })()}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
