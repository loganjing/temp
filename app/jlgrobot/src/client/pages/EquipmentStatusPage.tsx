import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Descriptions, Empty, Input, Select, Spin, Tag } from 'antd'
import { MasterDetail, MasterItem } from '../components/MasterDetail'
import { StatusTag, statusLabel } from '../components/StatusTag'
import { useAsync } from '../components/hooks'
import { formatDateTime, formatParams } from '../components/format'
import { fetchEquipmentList, fetchEquipmentStatuses, recordEquipmentStatus } from '../platform/resources'
import { EQUIPMENT_STATUS_VALUES, type EquipmentStatusValue } from '../../shared/contracts'
import { useT } from '../platform/i18n'

export default function EquipmentStatusPage() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const list = useAsync(() => fetchEquipmentList(keyword), [keyword])
  const statuses = useAsync(
    () => (selectedId ? fetchEquipmentStatuses(selectedId) : Promise.resolve({ items: [] })),
    [selectedId],
  )

  useEffect(() => {
    const first = list.data?.items?.[0]
    if (!selectedId && first) setSelectedId(first.id)
  }, [list.data, selectedId])

  const selected = useMemo(
    () => list.data?.items.find((e) => e.id === selectedId) ?? null,
    [list.data, selectedId],
  )

  const [newStatus, setNewStatus] = useState<EquipmentStatusValue>('running')
  const [newParams, setNewParams] = useState('')

  async function submitStatus() {
    if (!selectedId) return
    let params: Record<string, unknown> | undefined
    const trimmed = newParams.trim()
    if (trimmed) {
      try {
        params = JSON.parse(trimmed)
      } catch {
        message.error('运行参数需为合法 JSON')
        return
      }
    }
    setSubmitting(true)
    try {
      await recordEquipmentStatus(selectedId, newStatus, params)
      message.success('状态已记录')
      setNewParams('')
      statuses.reload()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '记录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MasterDetail
      master={
        <>
          <div className="md-master-header">
            <Input.Search
              placeholder={t('action.search')}
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {list.loading && <Spin size="small" />}
          </div>
          <div className="md-master-list">
            {list.data?.items.length === 0 && <Empty style={{ padding: 24 }} description={t('state.empty.equipment')} />}
            {list.data?.items.map((eq) => (
              <MasterItem
                key={eq.id}
                active={eq.id === selectedId}
                title={eq.name}
                meta={<span>{eq.identifier}</span>}
                onClick={() => setSelectedId(eq.id)}
              />
            ))}
          </div>
        </>
      }
      detail={
        !selected ? (
          <div className="detail-empty">{t('state.select-hint')}</div>
        ) : (
          <>
            <div className="detail-title">
              <h2>{selected.name}</h2>
              <Tag>{selected.identifier}</Tag>
            </div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t('common.name')}>{selected.name}</Descriptions.Item>
              <Descriptions.Item label={t('common.identifier')}>{selected.identifier}</Descriptions.Item>
              <Descriptions.Item label={t('common.type')}>{selected.type ?? '—'}</Descriptions.Item>
              <Descriptions.Item label={t('common.created-at')}>{formatDateTime(selected.created_at)}</Descriptions.Item>
            </Descriptions>

            <div className="detail-section">
              <h3>记录新状态</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Select
                  value={newStatus}
                  onChange={setNewStatus}
                  style={{ width: 140 }}
                  options={EQUIPMENT_STATUS_VALUES.map((s) => ({ value: s, label: statusLabel(s) }))}
                />
                <Input.TextArea
                  placeholder='运行参数 JSON，如 {"battery":85}'
                  value={newParams}
                  onChange={(e) => setNewParams(e.target.value)}
                  style={{ width: 320 }}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                />
                <Button type="primary" loading={submitting} onClick={submitStatus}>
                  {t('action.submit')}
                </Button>
              </div>
            </div>

            <div className="detail-section">
              <h3>状态历史</h3>
              {statuses.loading ? (
                <Spin />
              ) : statuses.data?.items.length ? (
                <div>
                  {statuses.data.items.map((s) => (
                    <div
                      key={s.id}
                      style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--app-border)' }}
                    >
                      <StatusTag status={s.status} />
                      <span style={{ color: 'var(--app-text-secondary)' }}>{formatParams(s.params)}</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--app-text-secondary)', fontSize: 12 }}>
                        {formatDateTime(s.recorded_at)}
                      </span>
                    </div>
                  ))}
                </div>
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
