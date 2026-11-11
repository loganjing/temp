import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Descriptions, Empty, Form, Input, Modal, Select, Spin, Timeline } from 'antd'
import { MasterDetail, MasterItem } from '../components/MasterDetail'
import { StatusTag, statusLabel } from '../components/StatusTag'
import { useAsync } from '../components/hooks'
import { formatDateTime, equipmentName } from '../components/format'
import {
  fetchEquipmentList,
  fetchUpgradeList,
  fetchUpgradeDetail,
  createUpgradeTask,
  advanceUpgradeStatus,
} from '../platform/resources'
import {
  UPGRADE_TARGET_STATUSES,
  UPGRADE_TRANSITIONS,
  type UpgradeStatus,
} from '../../shared/contracts'
import { useT } from '../platform/i18n'

export default function UpgradePage() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [equipmentFilter, setEquipmentFilter] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [creating, setCreating] = useState(false)

  const equipment = useAsync(() => fetchEquipmentList(), [])
  const equipmentMap = useMemo(
    () => new Map((equipment.data?.items ?? []).map((e) => [e.id, e])),
    [equipment.data],
  )
  const list = useAsync(() => fetchUpgradeList({ equipment_id: equipmentFilter, status: statusFilter }), [
    equipmentFilter,
    statusFilter,
  ])
  const detail = useAsync(() => (selectedId ? fetchUpgradeDetail(selectedId) : Promise.resolve(undefined)), [selectedId])

  useEffect(() => {
    const first = list.data?.items?.[0]
    if (!selectedId && first) setSelectedId(first.id)
  }, [list.data, selectedId])

  const selected = useMemo(() => list.data?.items.find((u) => u.id === selectedId) ?? null, [list.data, selectedId])
  const detailData = detail.data

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<{ equipment_id: string; package_id: string }>()

  const [advanceStatus, setAdvanceStatus] = useState<UpgradeStatus>('executing')
  const [advanceResult, setAdvanceResult] = useState('')
  const [advanceReason, setAdvanceReason] = useState('')

  const allowedTargets: UpgradeStatus[] = detailData ? UPGRADE_TRANSITIONS[detailData.status] : []

  useEffect(() => {
    setAdvanceStatus(allowedTargets[0] ?? 'executing')
    setAdvanceResult('')
    setAdvanceReason('')
  }, [detailData, selectedId])

  async function submitCreate() {
    const values = await createForm.validateFields()
    setCreating(true)
    try {
      const created = await createUpgradeTask(values.equipment_id, values.package_id)
      message.success('升级任务已创建')
      setCreateOpen(false)
      createForm.resetFields()
      list.reload()
      setSelectedId(created.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  async function advance() {
    if (!selectedId) return
    if (advanceStatus === 'failed' && !advanceReason.trim()) {
      message.error('失败时需填写失败原因')
      return
    }
    setSubmitting(true)
    try {
      await advanceUpgradeStatus(selectedId, {
        status: advanceStatus,
        result: advanceResult.trim() || undefined,
        failure_reason: advanceStatus === 'failed' ? advanceReason.trim() : undefined,
      })
      message.success(`状态已推进至 ${statusLabel(advanceStatus)}`)
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
            <Button type="primary" block onClick={() => setCreateOpen(true)}>
              {t('action.create')}
            </Button>
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
              options={UPGRADE_TARGET_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
            />
            {list.loading && <Spin size="small" />}
          </div>
          <div className="md-master-list">
            {list.data?.items.length === 0 && <Empty style={{ padding: 24 }} description={t('state.empty.list')} />}
            {list.data?.items.map((u) => (
              <MasterItem
                key={u.id}
                active={u.id === selectedId}
                title={u.package_id}
                meta={
                  <>
                    <StatusTag status={u.status} />
                    <span>{equipmentName(u.equipment_id, equipmentMap)}</span>
                  </>
                }
                onClick={() => setSelectedId(u.id)}
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
              <h2>{detailData.package_id}</h2>
              <StatusTag status={detailData.status} />
            </div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t('common.equipment')}>
                {equipmentName(detailData.equipment_id, equipmentMap)}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.package-id')}>{detailData.package_id}</Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <StatusTag status={detailData.status} />
              </Descriptions.Item>
              <Descriptions.Item label={t('common.created-at')}>{formatDateTime(detailData.created_at)}</Descriptions.Item>
              <Descriptions.Item label={t('common.updated-at')}>{formatDateTime(detailData.updated_at)}</Descriptions.Item>
              <Descriptions.Item label={t('common.result')}>{detailData.result ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('common.failure-reason')}>{detailData.failure_reason ?? '—'}</Descriptions.Item>
            </Descriptions>

            <div className="detail-section">
              <h3>{t('action.advance')}</h3>
              {allowedTargets.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
                  <Select
                    value={advanceStatus}
                    onChange={setAdvanceStatus}
                    options={allowedTargets.map((s) => ({ value: s, label: statusLabel(s) }))}
                    style={{ width: 200 }}
                  />
                  <Input.TextArea
                    placeholder={t('common.result')}
                    value={advanceResult}
                    onChange={(e) => setAdvanceResult(e.target.value)}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                  />
                  {advanceStatus === 'failed' && (
                    <Input.TextArea
                      placeholder={t('common.failure-reason')}
                      value={advanceReason}
                      onChange={(e) => setAdvanceReason(e.target.value)}
                      autoSize={{ minRows: 1, maxRows: 3 }}
                    />
                  )}
                  <div>
                    <Button type="primary" loading={submitting} onClick={advance}>
                      {t('action.advance')}
                    </Button>
                  </div>
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
