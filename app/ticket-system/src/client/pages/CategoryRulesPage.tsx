import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, Form, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { businessGroupApi, categoryRuleApi } from '../api/ticket-client'
import type { BusinessGroup, CategoryRule } from '../api/types'
import { ErrorView, LoadingView } from '../components/StateViews'
import { formatDateTime } from '../constants'

export default function CategoryRulesPage() {
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ruleRes, groupRes] = await Promise.all([categoryRuleApi.list(), businessGroupApi.list()])
      setRules(ruleRes.rules)
      setGroups(groupRes.groups)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载分类规则失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleCreate = async (values: { category: string; businessGroupId: string }) => {
    setBusy(true)
    try {
      await categoryRuleApi.create(values.category, values.businessGroupId)
      setFormOpen(false)
      form.resetFields()
      message.success('规则已创建')
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await categoryRuleApi.remove(id)
      message.success('规则已删除')
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '删除失败')
    }
  }

  if (loading && rules.length === 0) return <LoadingView tip="加载分类规则…" />
  if (error) return <ErrorView message={error} onRetry={load} />

  const groupName = (gid: string) => groups.find((g) => g.id === gid)?.name ?? gid

  return (
    <Card
      title={<Space>分类分配规则（{rules.length}）</Space>}
      extra={<Space>
        <Button icon={<ReloadOutlined />} onClick={load} size="small" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>新建规则</Button>
      </Space>}
    >
      {formOpen && (
        <Card size="small" style={{ marginBottom: 16 }} title="新建规则">
          <Form form={form} layout="inline" onFinish={(v) => void handleCreate(v)}>
            <Form.Item name="category" label="分类" rules={[{ required: true, message: '请输入分类' }]}>
              <Input placeholder="例如：网络问题" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="businessGroupId" label="分配到业务组" rules={[{ required: true, message: '请选择业务组' }]}>
              <Select
                style={{ width: 220 }}
                placeholder="选择业务组"
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={busy}>创建</Button>
                <Button onClick={() => { setFormOpen(false); form.resetFields() }}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}

      {rules.length === 0 ? (
        <Empty description="暂无分类分配规则" />
      ) : (
        <Table<CategoryRule>
          rowKey="id"
          size="small"
          dataSource={rules}
          pagination={false}
          columns={[
            { title: '分类', dataIndex: 'category', render: (v: string) => <Tag>{v}</Tag> },
            { title: '分配业务组', dataIndex: 'businessGroupId', render: (v: string) => groupName(v) },
            { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
            {
              title: '操作',
              key: 'actions',
              render: (_, r) => (
                <Popconfirm title="删除该规则？" onConfirm={() => void handleDelete(r.id)}>
                  <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      )}
      {rules.length === 0 && groups.length === 0 && (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          提示：请先在「业务组管理」创建业务组后再配置分类规则。
        </Typography.Text>
      )}
    </Card>
  )
}
