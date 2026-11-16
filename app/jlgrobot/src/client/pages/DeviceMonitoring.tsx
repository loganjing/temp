// M1 设备状态监测 — split-master-detail 布局
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Col, Descriptions, Empty, Row, Space, Spin, Table, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listDevices, updateDeviceStatus } from '../api'
import type { Device, DeviceStatus } from '../types'
import { StatusTag } from '../components/StatusTag'
import { StatusChangeMenu } from '../components/StatusChangeMenu'

const { Title, Text } = Typography

export function DeviceMonitoring() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [updating, setUpdating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    listDevices()
      .then((data) => {
        setDevices(data)
        if (!selectedId && data.length > 0) setSelectedId(data[0].id)
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : '加载设备列表失败')
      })
      .finally(() => setLoading(false))
  }, [selectedId])

  useEffect(() => {
    load()
  }, [load])

  const selected = devices.find((d) => d.id === selectedId)

  async function handleStatusChange(status: DeviceStatus) {
    if (!selected) return
    setUpdating(true)
    try {
      const updated = await updateDeviceStatus(selected.id, status)
      setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      message.success('设备状态已更新')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '状态更新失败')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div>
      <Title level={4}>设备状态监测</Title>
      <Row gutter={16}>
        <Col span={14}>
          <Card
            title="设备列表"
            extra={
              <Button icon={<ReloadOutlined />} size="small" onClick={load} loading={loading}>
                刷新
              </Button>
            }
          >
            <Spin spinning={loading}>
              <Table<Device>
                rowKey="id"
                dataSource={devices}
                pagination={false}
                size="middle"
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedId ? [selectedId] : [],
                  onChange: (keys) => setSelectedId(keys[0] as string),
                }}
                columns={[
                  { title: '设备名称', dataIndex: 'name' },
                  { title: '标识', dataIndex: 'identifier' },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    render: (status: DeviceStatus) => <StatusTag status={status} />,
                  },
                  {
                    title: '状态更新时间',
                    dataIndex: 'statusUpdatedAt',
                    render: (v: string) => new Date(v).toLocaleString('zh-CN'),
                  },
                ]}
              />
            </Spin>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="设备详情">
            {selected ? (
              <Spin spinning={updating}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Text>当前状态：</Text>
                    <StatusTag status={selected.status} />
                  </div>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="设备ID">{selected.id}</Descriptions.Item>
                    <Descriptions.Item label="设备名称">{selected.name}</Descriptions.Item>
                    <Descriptions.Item label="设备标识">{selected.identifier}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <StatusTag status={selected.status} />
                    </Descriptions.Item>
                    <Descriptions.Item label="状态更新时间">
                      {new Date(selected.statusUpdatedAt).toLocaleString('zh-CN')}
                    </Descriptions.Item>
                  </Descriptions>
                  <div>
                    <StatusChangeMenu current={selected.status} onChange={handleStatusChange} />
                  </div>
                </Space>
              </Spin>
            ) : (
              <Empty description="请选择左侧设备查看详情" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
