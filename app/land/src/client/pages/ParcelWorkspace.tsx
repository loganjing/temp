import { Link, useParams } from 'react-router-dom'
import { Card, ErrorBox, Loading, StatusBadge, useResource } from '../components/ui'
import { PARCEL_STATUS_LABELS, displayDateTime, displayMoney } from '../lib/format'
import { apiRequest } from '../platform/api-client'
import { useCan } from '../platform/permissions'
import type { ParcelDetail } from '../types'
import OverviewTab from '../components/parcel/OverviewTab'
import ProfileTab from '../components/parcel/ProfileTab'
import MapTab from '../components/parcel/MapTab'
import MarketTab from '../components/parcel/MarketTab'
import QuickAssessTab from '../components/parcel/QuickAssessTab'
import PlansTab from '../components/parcel/PlansTab'
import ApprovalTab from '../components/parcel/ApprovalTab'
import DashboardTab from '../components/parcel/DashboardTab'

const TABS: Array<{ key: string; label: string; permission: string }> = [
  { key: 'overview', label: '概览', permission: 'parcels:read' },
  { key: 'profile', label: '地块档案', permission: 'parcels:read' },
  { key: 'map', label: '地图', permission: 'parcels:read' },
  { key: 'market', label: '市场研究', permission: 'parcels:read' },
  { key: 'assessment', label: '快速评估', permission: 'parcels:read' },
  { key: 'plans', label: '方案测算', permission: 'parcels:read' },
  { key: 'approval', label: '审批', permission: 'parcels:read' },
  { key: 'dashboard', label: '看板与交接', permission: 'dashboards:read' },
]

export default function ParcelWorkspace() {
  const can = useCan()
  const { parcelId = '' } = useParams()
  const { tab = 'overview' } = useParams<'tab'>()
  const parcel = useResource<ParcelDetail>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcelId)}`))
  const visibleTabs = TABS.filter((entry) => can(entry.permission))
  const activeTab = visibleTabs.some((entry) => entry.key === tab) ? tab : visibleTabs[0]?.key ?? 'overview'

  if (parcel.busy && !parcel.data) return <Loading />
  if (parcel.error) return <Card title="地块加载失败"><ErrorBox cause={parcel.error} /></Card>
  if (!parcel.data) return null

  const detail = parcel.data
  const region = [detail.state, detail.city, detail.district].filter(Boolean).join(' / ') || '—'
  const progress = detail.progress

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>{detail.name}</h1>
          <p className="subtext">
            {region} · 面积 {displayMoney(detail.areaSqft)} sqft · 负责人 {detail.ownerName ?? '—'} · 更新于 {displayDateTime(detail.updatedAt)}
          </p>
        </div>
        <Link className="tab-link" to="/">← 返回台账</Link>
      </div>

      <Card>
        <div className="row-actions" style={{ alignItems: 'center' }}>
          <StatusBadge status={detail.status} label={PARCEL_STATUS_LABELS[detail.status]} />
          <div className="progress-steps grow">
            <span className={`step${progress.profileCollected ? ' done' : ''}`} title="档案/权属资料已录入">资料收集</span>
            <span className={`step${progress.marketResearched ? ' done' : ''}`} title="土地参考或竞品已录入">市场研究</span>
            <span className={`step${progress.assessmentDone ? ' done' : ''}`} title="快速评估已试算">快速评估</span>
            <span className={`step${progress.planFormalized ? ' done' : ''}`} title="存在正式化及之后状态的方案">正式测算</span>
            <span className={`step${progress.approvalDone ? ' done' : ''}`} title="已有决策记录">审批决策</span>
          </div>
          {detail.currentStageNote && <span className="hint">当前阶段备注：{detail.currentStageNote}</span>}
        </div>
        {detail.summaryIncomplete && <p className="hint">台账摘要尚未完成（无已正式化/采用的方案测算结果）。</p>}
      </Card>

      <nav className="tabs">
        {visibleTabs.map((entry) => (
          <Link key={entry.key} className={`tab-link${entry.key === activeTab ? ' active' : ''}`} to={`/parcels/${encodeURIComponent(parcelId)}/${entry.key}`}>
            {entry.label}
          </Link>
        ))}
      </nav>

      {activeTab === 'overview' && <OverviewTab parcel={detail} reload={parcel.reload} />}
      {activeTab === 'profile' && <ProfileTab parcel={detail} reload={parcel.reload} />}
      {activeTab === 'map' && <MapTab parcel={detail} />}
      {activeTab === 'market' && <MarketTab parcel={detail} />}
      {activeTab === 'assessment' && <QuickAssessTab parcel={detail} />}
      {activeTab === 'plans' && <PlansTab parcel={detail} reload={parcel.reload} />}
      {activeTab === 'approval' && <ApprovalTab parcel={detail} reload={parcel.reload} />}
      {activeTab === 'dashboard' && <DashboardTab parcel={detail} />}
    </div>
  )
}
