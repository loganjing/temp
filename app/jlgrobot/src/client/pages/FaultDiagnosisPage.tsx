import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Descriptions, Empty, Input, Select, Spin, Timeline } from 'antd'
import { MasterDetail, MasterItem } from '../components/MasterDetail'
import { StatusTag, statusLabel } from '../components/StatusTag'
import { useAsync } from '../components/hooks'
import { formatDateTime, equipmentName } from '../components/format'
import {
  fetchEquipmentList,
  fetchFaultList,
  fetchFaultDetail,
  updateFaultDiagnosis,
  advanceFaultStatus,
} from '../platform/resources'
import { FAULT_TARGET_STATUSES, FAULT_TRANSITIONS, type FaultStatus } from '../../shared/contracts'
import { useT } from '../platform/i18n'

export default function FaultDiagnosisPage() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [equipmentFilter, setEquipmentFilter] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const equipment = useAsync(() => fetchEquipmentList(), [])
  const equipmentMap = useMemo(
    () => new Map((equipment.data?.items ?? []).map((e) => [e.id, e])),
    [equipment.data],
  )
  const list = useAsync(() => fetchFaultList({ equipment_id: equipmentFilter, status: statusFilter }), [
    equipmentFilter,
    statusFilter,
  ])
  const detail = useAsync(() => (selectedId ? fetchFaultDetail(selectedId) : Promise.resolve(undefined)), [selectedId])

  useEffect(() => {
    const first = list.data?.items?.[0]
    if (!selectedId && first) setSelectedId(first.id)
  }, [list.data, selectedId])

  const selected = useMemo(() => list.data?.items.find((f) => f.id === selectedId) ?? null, [list.data, selectedId])
  const detailData = detail.data

  const [diagnosis, setDiagnosis] = useState('')
  const [suggestion, setSuggestion] = useState('')

  useEffect(() => {
    setDiagnosis(detailData?.diagnosis ?? '')
    setSuggestion(detailData?.suggestion ?? '')
  }, [detailData])

  const allowedTargets: FaultStatus[] = detailData ? FAULT_TRANSITIONS[detailData.status] : []

  async function saveDiagnosis() {
    if (!selectedId) return
    setSubmitting(true)
    try {
      await updateFaultDiagnosis(selectedId, { diagnosis, suggestion })
      message.success('诊断信息已保存')
      detail.reload()
      list.reload()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function advance(target: FaultStatus) {
    if (!selectedId) return
    setSubmitting(true)
    try {
      await advanceFaultStatus(selectedId, target)
      message.success(`状态已推进至 ${statusLabel(target)}`)
      detail.reload()
      list.reload()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '推进失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MasterDetail
      master={
        <>
          <div className="md-master-header">
            <Select
              placeholder={t('common.equipment')}
              allowClear
              value={equipmentFilter}
              onChange={setEquipmentFilter}
              style={{ width: '100%' }}
              options={(equipment.data?.items ?? []).map((e) => ({ value: e.id, label: `${e.name}（${e.identifier}）` }))}
            />
            <Select
              placeholder={t('common.status')}
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: '100%' }}
              options={FAULT_TARGET_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
            />
            {list.loading && <Spin size="small" />}
          </div>
          <div className="md-master-list">
            {list.data?.items.length === 0 && <Empty style={{ padding: 24 }} description={t('state.empty.list')} />}
            {list.data?.items.map((f) => (
              <MasterItem
                key={f.id}
                active={f.id === selectedId}
                title={f.description}
                meta={
                  <>
                    <StatusTag status={f.status} />
                    <span>{equipmentName(f.equipment_id, equipmentMap)}</span>
                  </>
                }
                onClick={() => setSelectedId(f.id)}
              />
            ))}
          </div>
        </>
      }
      detail={
        !selected || !detailData ? (
          <div className="detail-empty">{t('state.select-hint')}</div>
        ) : (
          <>
            <div className="detail-title">
              <h2>{detailData.description}</h2>
              <StatusTag status={detailData.status} />
            </div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t('common.equipment')}>
                {equipmentName(detailData.equipment_id, equipmentMap)}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <StatusTag status={detailData.status} />
              </Descriptions.Item>
              <Descriptions.Item label={t('common.created-at')}>{formatDateTime(detailData.created_at)}</Descriptions.Item>
              <Descriptions.Item label={t('common.updated-at')}>{formatDateTime(detailData.updated_at)}</Descriptions.Item>
              <Descriptions.Item label={t('common.closed-at')}>{formatDateTime(detailData.closed_at)}</Descriptions.Item>
            </Descriptions>

            <div className="detail-section">
              <h3>诊断信息</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
                <Input.TextArea
                  placeholder={t('common.diagnosis')}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
                <Input.TextArea
                  placeholder={t('common.suggestion')}
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
                <div>
                  <Button type="primary" loading={submitting} onClick={saveDiagnosis}>
                    {t('action.save')}
                  </Button>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h3>{t('action.advance')}</h3>
              {allowedTargets.length ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {allowedTargets.map((target) => (
                    <Button key={target} loading={submitting} onClick={() => advance(target)}>
                      → {statusLabel(target)}
                    </Button>
                  ))}
                </div>
              ) : (
                <span style={{ color: 'var(--app-text-secondary)' }}>当前状态无后续流转</span>
              )}
            </div>

            <div className="detail-section">
              <h3>{t('common.status-logs')}</h3>
              {detailData.status_logs.length ? (
                <Timeline
                  items={detailData.status_logs.map((log) => ({
                    children: (
                      <span>
                        {log.from_status ? statusLabel(log.from_status) : '起始'} → {statusLabel(log.to_status)}
                        <span style={{ marginLeft: 8, color: 'var(--app-text-secondary)', fontSize: 12 }}>
                          {formatDateTime(log.changed_at)}
                        </span>
                      </span>
                    ),
                  }))}
                />
              ) : (
                <Empty description={t('state.empty')} />
              )}
            </div>
          </>
        )
      }
    />
  )
}
