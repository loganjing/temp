import { useCallback, useEffect, useState } from 'react'
import { Select, Table, Button, Tag, Space, Spin, Empty, App as AntApp } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiRequest, ApiRequestError } from '../platform/api-client'
import type {
  Equipment,
  EquipmentListResponse,
  UpgradeRecord,
  UpgradeListResponse,
  UpgradeStatus,
} from '../types'

const STATUS_LABELS: Record<UpgradeStatus, string> = {
  in_progress: '进行中',
  success: '成功',
  failed: '失败',
}

const STATUS_COLORS: Record<UpgradeStatus, string> = {
  in_progress: 'processing',
  success: 'green',
  failed: 'red',
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value: value as UpgradeStatus,
  label,
}))

export default function UpgradesPage() {
  const { message } = AntApp.useApp()
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [equipmentLoading, setEquipmentLoading] = useState(true)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null)

  const [upgrades, setUpgrades] = useState<UpgradeRecord[]>([])
  const [upgradesLoading, setUpgradesLoading] = useState(false)
  const [upgradesError, setUpgradesError] = useState<string | null>(null)

  const [initiating, setInitiating] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null)

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

  const loadUpgrades = useCallback(async (equipmentId: number) => {
    setUpgradesLoading(true)
    setUpgradesError(null)
    try {
      const data = await apiRequest<UpgradeListResponse>(`/api/equipment/${equipmentId}/upgrades`)
      setUpgrades(data.items ?? [])
    } catch (e) {
      setUpgradesError(e instanceof ApiRequestError ? e.message : '加载升级记录失败')
    } finally {
      setUpgradesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEquipment()
  }, [loadEquipment])

  useEffect(() => {
    if (selectedEquipmentId !== null) loadUpgrades(selectedEquipmentId)
    else setUpgrades([])
  }, [selectedEquipmentId, loadUpgrades])

  const handleInitiate = async () => {
    if (selectedEquipmentId === null) return
    setInitiating(true)
    try {
      await apiRequest<UpgradeRecord>(`/api/equipment/${selectedEquipmentId}/upgrades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      message.success('升级已发起')
      await loadUpgrades(selectedEquipmentId)
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '发起升级失败')
    } finally {
      setInitiating(false)
    }
  }

  const handleUpdateStatus = async (upgradeId: number, status: UpgradeStatus) => {
    setUpdatingStatusId(upgradeId)
    try {
      await apiRequest<UpgradeRecord>(`/api/upgrades/${upgradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      message.success('升级状态更新成功')
      if (selectedEquipmentId !== null) await loadUpgrades(selectedEquipmentId)
    } catch (e) {
      message.error(e instanceof ApiRequestError ? e.message : '更新升级状态失败')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const columns: ColumnsType<UpgradeRecord> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: UpgradeStatus) => <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>,
    },
    { title: '开始时间', dataIndex: 'startedAt', key: 'startedAt' },
    { title: '完成时间', dataIndex: 'completedAt', key: 'completedAt' },
    {
      title: '更新状态',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Select
          size="small"
          value={record.status}
          options={STATUS_OPTIONS}
          loading={updatingStatusId === record.id}
          onChange={(value: UpgradeStatus) => handleUpdateStatus(record.id, value)}
          style={{ width: '100%' }}
        />
      ),
    },
  ]

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
            <Button type="primary" loading={initiating} disabled={selectedEquipmentId === null} onClick={handleInitiate}>
              发起升级
            </Button>
          </Space>
        )}
      </div>
      {selectedEquipmentId === null ? (
        <Empty description="请先选择设备" />
      ) : upgradesLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : upgradesError ? (
        <Space>
          <span style={{ color: '#ff4d4f' }}>{upgradesError}</span>
          <Button size="small" onClick={() => loadUpgrades(selectedEquipmentId)}>重试</Button>
        </Space>
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={upgrades}
          pagination={false}
          locale={{ emptyText: '暂无升级记录' }}
        />
      )}
    </div>
  )
}
