import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Descriptions, Empty, Form, Input, Modal, Select, Spin, Timeline } from 'antd'
import { MasterDetail, MasterItem } from '../components/MasterDetail'
import { StatusTag, statusLabel } from '../components/StatusTag'
import { useAsync } from '../components/hooks'
import { formatDateTime, equipmentName } from '../components/format'
import {
  fetchEquipmentList,
  fetchFaultList,
  fetchWorkOrderList,
  fetchWorkOrderDetail,
  createWorkOrder,
  addWorkOrderRecord,
  advanceWorkOrderStatus,
} from '../platform/resources'
import {
  WORK_ORDER_TARGET_STATUSES,
  WORK_ORDER_TRANSITIONS,
  type WorkOrderStatus,
} from '../../shared/contracts'
import { useT } from '../platform/i18n'

export default function WorkOrderPage() {
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
  const faults = useAsync(() => fetchFaultList(), [])
  const faultMap = useMemo(
    () => new Map((faults.data?.items ?? []).map((f) => [f.id, f])),
    [faults.data],
  )
  const list = useAsync(() => fetchWorkOrderList({ equipment_id: equipmentFilter, status: statusFilter }), [
    equipmentFilter,
    statusFilter,
  ])
  const detail = useAsync(() => (selectedId ? fetchWorkOrderDetail(selectedId) : Promise.resolve(undefined)), [selectedId])

  useEffect(() => {
    const first = list.data?.items?.[0]
    if (!selectedId && first) setSelectedId(first.id)
  }, [list.data, selectedId])

  const selected = useMemo(() => list.data?.items.find((w) => w.id === selectedId) ?? null, [list.data, selectedId])
  const detailData = detail.data

  const allowedTargets: WorkOrderStatus[] = detailData ? WORK_ORDER_TRANSITIONS[detailData.status] : []

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<{ equipment_id: string; fault_id?: string; description: string }>()

  const [recordContent, setRecordContent] = useState('')

  async function submitCreate() {
    const values = await createForm.validateFields()
    setCreating(true)
    try {
      const created = await createWorkOrder({
        equipment_id: values.equipment_id,
        fault_id: values.fault_id,
        description: values.description,
      })
      message.success('工单已创建')
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

  async function addRecord() {
    if (!selectedId) return
    if (!recordContent.trim()) {
      message.error('请填写处理记录内容')
      return
    }
    setSubmitting(true)
    try {
      await addWorkOrderRecord(selectedId, recordContent.trim())
      message.success('处理记录已添加')
      setRecordContent('')
      detail.reload()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function advance(target: WorkOrderStatus) {
    if (!selectedId) return
    setSubmitting(true)
    try {
      await advanceWorkOrderStatus(selectedId, target)
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
              options={WORK_ORDER_TARGET_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
            />
            {list.loading && <Spin size="small" />}
          </div>
          <div className="md-master-list">
            {list.data?.items.length === 0 && <Empty style={{ padding: 24 }} description={t('state.empty.list')} />}
            {list.data?.items.map((w) => (
              <MasterItem
                key={w.id}
                active={w.id === selectedId}
                title={w.description}
                meta={
                  <>
                    <StatusTag status={w.status} />
                    <span>{equipmentName(w.equipment_id, equipmentMap)}</span>
                  </>
                }
                onClick={() => setSelectedId(w.id)}
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
              <Descriptions.Item label={t('common.fault-id')}>
                {detailData.fault_id
                  ? faultMap.get(detailData.fault_id)?.description ?? detailData.fault_id
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.created-at')}>{formatDateTime(detailData.created_at)}</Descriptions.Item>
              <Descriptions.Item label={t('common.updated-at')}>{formatDateTime(detailData.updated_at)}</Descriptions.Item>
              <Descriptions.Item label={t('common.closed-at')}>{formatDateTime(detailData.closed_at)}</Descriptions.Item>
            </Descriptions>

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
              <h3>{t('common.records')}</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, maxWidth: 560 }}>
                <Input.TextArea
                  placeholder={t('common.content')}
                  value={recordContent}
                  onChange={(e) => setRecordContent(e.target.value)}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  style={{ flex: 1 }}
                />
                <Button type="primary" loading={submitting} onClick={addRecord}>
                  {t('action.add')}
                </Button>
              </div>
              {detailData.records.length ? (
                <Timeline
                  items={detailData.records.map((r) => ({
                    children: (
                      <span>
                        {r.content}
                        <span style={{ marginLeft: 8, color: 'var(--app-text-secondary)', fontSize: 12 }}>
                          {formatDateTime(r.created_at)}
                        </span>
                      </span>
                    ),
                  }))}
                />
              ) : (
                <Empty description={t('state.empty')} />
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
