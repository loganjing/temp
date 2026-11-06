import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Form, Input, Modal, Space, Spin, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  listAlerts, handleAlert, getAlert, reportError,
  type Alert, type AlertDetail, type AlertStatus,
} from '../platform/api-client'
import { DetailDrawer, DetailField } from '../components/DetailDrawer'

const statusMap: Record<AlertStatus, { label: string; color: string }> = {
  pending: { label: '待处置', color: 'orange' },
  handling: { label: '处置中', color: 'blue' },
  handled: { label: '已处置', color: 'green' },
}

export default function Handling() {
  const [pendingAlerts, setPendingAlerts] = useState<Alert[]>([])
  const [handlingAlerts, setHandlingAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<AlertDetail | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [completeTarget, setCompleteTarget] = useState<Alert | null>(null)
  const [completeForm] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pending, handling] = await Promise.all([
        listAlerts('pending'),
        listAlerts('handling'),
      ])
      setPendingAlerts(pending)
      setHandlingAlerts(handling)
    } catch (e) {
      reportError(e, '加载处置队列失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function showDetail(record: Alert) {
    setDrawerOpen(true)
    setDetailLoading(true)
    try {
      setSelected(await getAlert(record.id))
    } catch (e) {
      reportError(e, '加载告警详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  async function onConfirm(alert: Alert) {
    try {
      await handleAlert(alert.id, { handler: '值班人员', action: 'confirm' })
      message.success('已确认接收，告警状态变更为处置中')
      await load()
    } catch (e) {
      reportError(e, '确认接收失败')
    }
  }

  function openComplete(alert: Alert) {
    setCompleteTarget(alert)
    completeForm.resetFields()
  }

  async function submitComplete(values: { handler: string; handling_result: string }) {
    if (!completeTarget) return
    if (!values.handling_result?.trim()) { message.warning('请输入处置结果说明'); return }
    try {
      await handleAlert(completeTarget.id, {
        handler: values.handler?.trim() || '值班人员',
        action: 'complete',
        handling_result: values.handling_result.trim(),
      })
      message.success('处置完成，告警状态变更为已处置')
      setCompleteTarget(null)
      await load()
    } catch (e) {
      reportError(e, '完成处置失败')
    }
  }

  const pendingColumns: ColumnsType<Alert> = [
    { title: '事件类型', dataIndex: 'eventType', key: 'eventType' },
    { title: '视频来源', dataIndex: 'videoSourceName', key: 'videoSourceName' },
    { title: '告警时间', dataIndex: 'alertTime', key: 'alertTime', width: 200 },
    {
      title: '操作', key: 'action', width: 220,
      render: (_, r) => (
        <Space>
          <Button type="primary" size="small" onClick={() => onConfirm(r)}>确认接收</Button>
          <Button type="link" size="small" onClick={() => showDetail(r)}>详情</Button>
        </Space>
      ),
    },
  ]

  const handlingColumns: ColumnsType<Alert> = [
    { title: '事件类型', dataIndex: 'eventType', key: 'eventType' },
    { title: '视频来源', dataIndex: 'videoSourceName', key: 'videoSourceName' },
    { title: '告警时间', dataIndex: 'alertTime', key: 'alertTime', width: 200 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: AlertStatus) => <Tag color={statusMap[s].color}>{statusMap[s].label}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 220,
      render: (_, r) => (
        <Space>
          <Button type="primary" size="small" onClick={() => openComplete(r)}>完成处置</Button>
          <Button type="link" size="small" onClick={() => showDetail(r)}>详情</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Spin spinning={loading}>
        <h3>待处置告警队列</h3>
        <Table
          rowKey="id"
          columns={pendingColumns}
          dataSource={pendingAlerts}
          locale={{ emptyText: '暂无待处置告警' }}
          style={{ marginBottom: 24 }}
        />
        <h3>处置中告警</h3>
        <Table
          rowKey="id"
          columns={handlingColumns}
          dataSource={handlingAlerts}
          locale={{ emptyText: '暂无处置中告警' }}
        />
      </Spin>

      <DetailDrawer open={drawerOpen} title="告警详情" onClose={() => { setDrawerOpen(false); setSelected(null) }}>
        <Spin spinning={detailLoading}>
          {selected && (
            <Descriptions column={1} bordered size="small">
              <DetailField label="告警ID">{selected.id}</DetailField>
              <DetailField label="事件类型">{selected.eventType}</DetailField>
              <DetailField label="视频来源">{selected.videoSourceName}</DetailField>
              <DetailField label="关联事件ID">{selected.eventId}</DetailField>
              <DetailField label="事件发生时间">{selected.occurredAt}</DetailField>
              <DetailField label="告警时间">{selected.alertTime}</DetailField>
              <DetailField label="状态">
                <Tag color={statusMap[selected.status].color}>{statusMap[selected.status].label}</Tag>
              </DetailField>
              <DetailField label="处置记录数">{selected.handlingRecords.length}</DetailField>
            </Descriptions>
          )}
        </Spin>
      </DetailDrawer>

      <Modal
        open={!!completeTarget}
        title="完成处置"
        onCancel={() => setCompleteTarget(null)}
        onOk={() => completeForm.submit()}
        destroyOnClose
      >
        <Form form={completeForm} layout="vertical" onFinish={submitComplete}>
          <Form.Item name="handler" label="处置人">
            <Input placeholder="默认：值班人员" />
          </Form.Item>
          <Form.Item name="handling_result" label="处置结果说明" rules={[{ required: true, message: '请输入处置结果说明' }]}>
            <Input.TextArea rows={3} placeholder="请输入处置结果说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
