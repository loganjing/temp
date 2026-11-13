import { useCallback, useEffect, useState } from 'react'
import { Select, Timeline, Spin, Empty, Space, Button, Tag, Card } from 'antd'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { Equipment, EquipmentListResponse, HistoryResponse, HistoryEvent } from '../types'

const EVENT_LABELS: Record<string, string> = {
  fault: '故障诊断',
  upgrade: '远程升级',
  work_order: '维修工单',
}

const EVENT_COLORS: Record<string, string> = {
  fault: 'red',
  upgrade: 'blue',
  work_order: 'green',
}

const STATUS_DISPLAY: Record<string, string> = {
  in_progress: '进行中',
  success: '成功',
  failed: '失败',
  pending: '待处理',
  completed: '已完成',
}

function renderEventContent(event: HistoryEvent): React.ReactNode {
  const parts: React.ReactNode[] = [
    <strong key="label">{EVENT_LABELS[event.type] ?? event.type}</strong>,
  ]
  if (event.description) parts.push(<span key="desc"> — {event.description}</span>)
  if (event.status) {
    parts.push(
      <Tag key="status" color={EVENT_COLORS[event.type]} style={{ marginLeft: 8 }}>
        {STATUS_DISPLAY[event.status] ?? event.status}
      </Tag>,
    )
  }
  if (event.result) parts.push(<span key="result"> — {event.result}</span>)
  return <span>{parts}</span>
}

export default function HistoryPage() {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [equipmentLoading, setEquipmentLoading] = useState(true)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null)

  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const loadEquipment = useCallback(async () => {
    setEquipmentLoading(true)
    setEquipmentError(null)
    try {
      const data = await apiRequest<EquipmentListResponse>('/api/equipment')
      setEquipmentList(data.items ?? [])
    } catch (e) {
      setEquipmentError(e instanceof ApiRequestError ? e.message : '加载设备列表失败')
    } finally {
      setEquipmentLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async (equipmentId: number) => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const data = await apiRequest<HistoryResponse>(`/api/equipment/${equipmentId}/history`)
      setHistory(data)
    } catch (e) {
      setHistoryError(e instanceof ApiRequestError ? e.message : '加载设备履历失败')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEquipment()
  }, [loadEquipment])

  useEffect(() => {
    if (selectedEquipmentId !== null) loadHistory(selectedEquipmentId)
    else setHistory(null)
  }, [selectedEquipmentId, loadHistory])

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {equipmentLoading ? (
          <Spin />
        ) : equipmentError ? (
          <Space>
            <span style={{ color: '#ff4d4f' }}>{equipmentError}</span>
            <Button size="small" onClick={loadEquipment}>重试</Button>
          </Space>
        ) : (
          <Space>
            <span>选择设备：</span>
            <Select
              style={{ width: 300 }}
              placeholder="请选择设备"
              value={selectedEquipmentId}
              onChange={(value: number) => setSelectedEquipmentId(value)}
              options={equipmentList.map((e) => ({ value: e.id, label: `${e.code} - ${e.name}` }))}
            />
          </Space>
        )}
      </div>
      {selectedEquipmentId === null ? (
        <Empty description="请先选择设备" />
      ) : historyLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : historyError ? (
        <Space>
          <span style={{ color: '#ff4d4f' }}>{historyError}</span>
          <Button size="small" onClick={() => loadHistory(selectedEquipmentId)}>重试</Button>
        </Space>
      ) : history ? (
        <Card title={`${history.equipment.code} - ${history.equipment.name} 的设备履历`}>
          {history.events.length === 0 ? (
            <Empty description="暂无历史事件" />
          ) : (
            <Timeline
              items={history.events.map((event) => ({
                color: EVENT_COLORS[event.type] ?? 'gray',
                children: (
                  <div>
                    {renderEventContent(event)}
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{event.timestamp}</div>
                  </div>
                ),
              }))}
            />
          )}
        </Card>
      ) : (
        <Empty description="暂无数据" />
      )}
    </div>
  )
}
