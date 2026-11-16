// M2 故障诊断 — 按设备筛选的诊断列表 + 创建诊断表单
import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { createFaultDiagnosis, listFaultDiagnoses } from '../api'
import type { FaultDiagnosis } from '../types'
import { DeviceSelect } from '../components/DeviceSelect'

const { Title } = Typography

export function FaultDiagnosisPage() {
  const [deviceId, setDeviceId] = useState<string | undefined>()
  const [list, setList] = useState<FaultDiagnosis[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<{ description: string }>()

  const load = useCallback(() => {
    if (!deviceId) {
      setList([])
      return
    }
    setLoading(true)
    listFaultDiagnoses(deviceId)
      .then(setList)
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : '加载故障诊断列表失败')
        setList([])
      })
      .finally(() => setLoading(false))
  }, [deviceId])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit() {
    const values = await form.validateFields()
    if (!deviceId) return
    setSubmitting(true)
    try {
      await createFaultDiagnosis(deviceId, values.description)
      message.success('故障诊断记录已创建')
      setModalOpen(false)
      form.resetFields()
      load()
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '创建故障诊断失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Title level={4}>故障诊断</Title>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <span>按设备筛选：</span>
          <DeviceSelect
            value={deviceId}
            onChange={(v) => setDeviceId(v)}
            placeholder="选择设备"
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!deviceId}
            onClick={() => setModalOpen(true)}
          >
            创建诊断
          </Button>
        </Space>
        <Spin spinning={loading}>
          <Table<FaultDiagnosis>
            rowKey="id"
            dataSource={list}
            pagination={false}
            size="middle"
            columns={[
              { title: '故障描述', dataIndex: 'description' },
              {
                title: '诊断时间',
                dataIndex: 'diagnosedAt',
                render: (v: string) => new Date(v).toLocaleString('zh-CN'),
              },
            ]}
          />
        </Spin>
      </Card>
      <Modal
        title="创建故障诊断"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="description"
            label="故障描述"
            rules={[{ required: true, message: '请输入故障描述' }]}
          >
            <Input.TextArea rows={3} placeholder="描述设备故障现象" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
