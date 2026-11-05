import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import type { FormInstance, TableProps } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest, errorFields, errorMessage } from '../../platform/api-client'
import type { AssignmentRule, BusinessGroup, CategoryConfig, GroupRef } from '../../platform/types'

interface CategoryValues {
  name: string
  sortOrder?: number
  enabled?: boolean
}

function applyFieldErrors(form: FormInstance, cause: unknown) {
  const fields = errorFields(cause)
  if (!fields) return
  form.setFields(Object.entries(fields).map(([name, error]) => ({ name, errors: [error] })))
}

function RuleRow({ category, rule, groups, onSaved }: {
  category: CategoryConfig
  rule?: AssignmentRule
  groups: GroupRef[]
  onSaved: () => Promise<void>
}) {
  const { message } = App.useApp()
  const [groupId, setGroupId] = useState<string | undefined>(rule?.groupId)
  const [enabled, setEnabled] = useState<boolean>(rule?.enabled ?? true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setGroupId(rule?.groupId)
    setEnabled(rule?.enabled ?? true)
  }, [rule])

  const save = async () => {
    if (!groupId) {
      message.warning('请选择目标业务组')
      return
    }
    setSaving(true)
    try {
      await apiRequest('/api/assignment-rules', { method: 'PUT', body: JSON.stringify({ categoryId: category.id, groupId, enabled }) })
      message.success(`已保存「${category.name}」的分配规则`)
      await onSaved()
    } catch (cause) {
      message.error(errorMessage(cause, '保存分配规则失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Space wrap size="middle">
      <Select<string>
        style={{ width: 220 }}
        placeholder="选择目标业务组"
        showSearch
        optionFilterProp="label"
        value={groupId}
        onChange={setGroupId}
        options={groups.map((group) => ({ value: group.id, label: group.name }))}
        disabled={!category.enabled}
      />
      <Switch checked={enabled} onChange={setEnabled} checkedChildren="启用" unCheckedChildren="停用" disabled={!category.enabled} />
      <Button size="small" type="primary" loading={saving} onClick={() => void save()} disabled={!groupId || !category.enabled}>保存</Button>
      {!rule && <Tag bordered={false}>未配置</Tag>}
    </Space>
  )
}

export default function CategoriesRulesPage() {
  const { message } = App.useApp()
  const [categories, setCategories] = useState<CategoryConfig[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [groups, setGroups] = useState<GroupRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<CategoryValues>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [categoryResult, ruleResult, groupResult] = await Promise.all([
        apiRequest<{ items: CategoryConfig[] }>('/api/ticket-categories'),
        apiRequest<{ items: AssignmentRule[] }>('/api/assignment-rules'),
        apiRequest<{ items: BusinessGroup[] }>('/api/business-groups'),
      ])
      setCategories(categoryResult.items)
      setRules(ruleResult.items)
      setGroups(groupResult.items.map((group) => ({ id: group.id, name: group.enabled ? group.name : `${group.name}（已停用）` })))
      setError(null)
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ sortOrder: categories.length * 10 + 10 })
    setModalOpen(true)
  }

  const openEdit = (category: CategoryConfig) => {
    setEditing(category)
    form.setFieldsValue({ name: category.name, sortOrder: category.sortOrder, enabled: category.enabled })
    setModalOpen(true)
  }

  const saveCategory = async (values: CategoryValues) => {
    setSaving(true)
    try {
      if (editing) {
        await apiRequest(`/api/ticket-categories/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(values) })
        message.success('分类已更新')
      } else {
        await apiRequest('/api/ticket-categories', {
          method: 'POST',
          body: JSON.stringify({ name: values.name, sortOrder: values.sortOrder }),
        })
        message.success('分类已创建')
      }
      setModalOpen(false)
      form.resetFields()
      await load()
    } catch (cause) {
      applyFieldErrors(form, cause)
      message.error(errorMessage(cause, '保存分类失败'))
    } finally {
      setSaving(false)
    }
  }

  const toggleCategory = async (category: CategoryConfig) => {
    try {
      await apiRequest(`/api/ticket-categories/${encodeURIComponent(category.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !category.enabled }),
      })
      message.success(category.enabled ? '分类已停用' : '分类已启用')
      await load()
    } catch (cause) {
      message.error(errorMessage(cause, '更新分类状态失败'))
    }
  }

  const categoryColumns: TableProps<CategoryConfig>['columns'] = [
    { title: '分类名称', dataIndex: 'name' },
    { title: '排序', dataIndex: 'sortOrder', width: 90 },
    { title: '状态', dataIndex: 'enabled', width: 110, render: (enabled: boolean) => <Tag color={enabled ? 'green' : 'default'}>{enabled ? '启用' : '停用'}</Tag> },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => void toggleCategory(record)}>{record.enabled ? '停用' : '启用'}</Button>
        </Space>
      ),
    },
  ]

  if (error) {
    return (
      <Card>
        <Alert type="error" showIcon message="加载配置失败" description={errorMessage(error)} action={<Button size="small" onClick={() => void load()}>重试</Button>} />
      </Card>
    )
  }

  return (
    <div className="page">
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            title="问题分类"
            extra={
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建分类</Button>
              </Space>
            }
          >
            <Typography.Paragraph type="secondary">分类仅对本公司可见，停用后不再出现在提交与筛选选项中。</Typography.Paragraph>
            <Table<CategoryConfig>
              rowKey="id"
              size="middle"
              loading={loading}
              columns={categoryColumns}
              dataSource={categories}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无分类"><Button type="primary" onClick={openCreate}>创建第一个分类</Button></Empty> }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="自动分配规则">
            <Typography.Paragraph type="secondary">
              按“分类 → 业务组”配置，同一分类只保留一条规则；停用规则或分类后，新工单进入待分配。规则只影响保存后创建的工单。
            </Typography.Paragraph>
            {categories.length === 0 ? (
              <Empty description="请先创建问题分类" />
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {categories.map((category) => {
                  const rule = rules.find((item) => item.categoryId === category.id)
                  return (
                    <div key={category.id} className="rule-row">
                      <div className="rule-name">
                        <Typography.Text strong>{category.name}</Typography.Text>
                        {!category.enabled && <Tag bordered={false}>分类已停用</Tag>}
                      </div>
                      <RuleRow category={category} rule={rule} groups={groups} onSaved={load} />
                      {rule && (
                        <Typography.Text type="secondary">
                          当前规则：{rule.groupName} · {rule.enabled ? '启用中' : '已停用'}
                        </Typography.Text>
                      )}
                    </div>
                  )
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={editing ? '编辑分类' : '新建分类'}
        open={modalOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => form.submit()}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false} onFinish={(values) => void saveCategory(values)}>
          <Form.Item label="分类名称" name="name" rules={[{ required: true, message: '请填写分类名称' }, { max: 40, message: '名称不能超过 40 个字符' }]}>
            <Input maxLength={40} placeholder="例如：账务问题" />
          </Form.Item>
          <Form.Item label="排序值" name="sortOrder">
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>
          {editing && (
            <Form.Item label="启用状态" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
