import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Drawer, Empty, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import type { FormInstance, TableProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, errorFields, errorMessage } from '../../platform/api-client'
import type { BusinessGroup, CompanyUser } from '../../platform/types'

interface GroupValues {
  name: string
  description?: string
  enabled?: boolean
}

function applyFieldErrors(form: FormInstance, cause: unknown) {
  const fields = errorFields(cause)
  if (!fields) return
  form.setFields(Object.entries(fields).map(([name, error]) => ({ name, errors: [error] })))
}

export default function GroupsPage() {
  const { message } = App.useApp()
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<BusinessGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const [memberGroupId, setMemberGroupId] = useState<string | null>(null)
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [memberBusy, setMemberBusy] = useState(false)
  const [form] = Form.useForm<GroupValues>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest<{ items: BusinessGroup[] }>('/api/business-groups')
      setGroups(result.items)
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

  const memberGroup = useMemo(() => groups.find((group) => group.id === memberGroupId) ?? null, [groups, memberGroupId])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const result = await apiRequest<{ items: CompanyUser[] }>('/api/company-users')
      setUsers(result.items)
    } catch (cause) {
      message.error(errorMessage(cause, '加载本公司用户失败'))
    } finally {
      setUsersLoading(false)
    }
  }, [message])

  useEffect(() => {
    if (memberGroupId) void loadUsers()
  }, [memberGroupId, loadUsers])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (group: BusinessGroup) => {
    setEditing(group)
    form.setFieldsValue({ name: group.name, description: group.description ?? '', enabled: group.enabled })
    setModalOpen(true)
  }

  const save = async (values: GroupValues) => {
    setSaving(true)
    try {
      if (editing) {
        await apiRequest(`/api/business-groups/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(values) })
        message.success('业务组已更新')
      } else {
        await apiRequest('/api/business-groups', { method: 'POST', body: JSON.stringify({ name: values.name, description: values.description || undefined }) })
        message.success('业务组已创建')
      }
      setModalOpen(false)
      form.resetFields()
      await load()
    } catch (cause) {
      applyFieldErrors(form, cause)
      message.error(errorMessage(cause, '保存业务组失败'))
    } finally {
      setSaving(false)
    }
  }

  const addMember = async (userId: string) => {
    if (!memberGroup) return
    setMemberBusy(true)
    try {
      await apiRequest(`/api/business-groups/${encodeURIComponent(memberGroup.id)}/members`, { method: 'POST', body: JSON.stringify({ userId }) })
      message.success('成员已加入业务组')
      await load()
    } catch (cause) {
      message.error(errorMessage(cause, '添加成员失败'))
    } finally {
      setMemberBusy(false)
    }
  }

  const removeMember = async (userId: string) => {
    if (!memberGroup) return
    setMemberBusy(true)
    try {
      await apiRequest(`/api/business-groups/${encodeURIComponent(memberGroup.id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      message.success('成员已移出业务组')
      await load()
    } catch (cause) {
      message.error(errorMessage(cause, '移除成员失败'))
    } finally {
      setMemberBusy(false)
    }
  }

  const columns: TableProps<BusinessGroup>['columns'] = [
    { title: '业务组', dataIndex: 'name' },
    { title: '描述', dataIndex: 'description', render: (value: string | null) => value || '—' },
    { title: '成员数', dataIndex: 'members', width: 100, render: (members: BusinessGroup['members']) => members.length },
    { title: '状态', dataIndex: 'enabled', width: 100, render: (enabled: boolean) => <Tag color={enabled ? 'green' : 'default'}>{enabled ? '启用' : '停用'}</Tag> },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, record) => (
        <Space>
          <Button size="small" onClick={() => setMemberGroupId(record.id)}>成员</Button>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
        </Space>
      ),
    },
  ]

  const memberColumns: TableProps<BusinessGroup['members'][number]>['columns'] = [
    { title: '姓名', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '部门', dataIndex: 'department' },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record) => (
        <Popconfirm title="确认将该成员移出业务组？" okText="移除" cancelText="取消" onConfirm={() => void removeMember(record.id)}>
          <Button size="small" danger loading={memberBusy}>移除</Button>
        </Popconfirm>
      ),
    },
  ]

  const memberIds = new Set(memberGroup?.members.map((member) => member.id) ?? [])
  const addableUsers = users.filter((user) => user.enabled && !memberIds.has(user.id))

  return (
    <div className="page">
      <Card
        size="small"
        title="业务组与成员"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建业务组</Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          业务组属于本公司，成员只可来自本公司用户；成员关系同时决定处理人可处理的工单范围。
        </Typography.Paragraph>
        {error ? (
          <Alert type="error" showIcon message="加载业务组失败" description={errorMessage(error)} action={<Button size="small" onClick={() => void load()}>重试</Button>} />
        ) : (
          <Table<BusinessGroup>
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={groups}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无业务组"><Button type="primary" onClick={openCreate}>创建第一个业务组</Button></Empty> }}
          />
        )}
      </Card>

      <Modal
        title={editing ? '编辑业务组' : '新建业务组'}
        open={modalOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => form.submit()}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false} onFinish={(values) => void save(values)}>
          <Form.Item label="业务组名称" name="name" rules={[{ required: true, message: '请填写业务组名称' }, { max: 60, message: '名称不能超过 60 个字符' }]}>
            <Input maxLength={60} placeholder="例如：财务支持组" />
          </Form.Item>
          <Form.Item label="描述（可选）" name="description" rules={[{ max: 200, message: '描述不能超过 200 个字符' }]}>
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
          {editing && (
            <Form.Item label="启用状态" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer
        title={memberGroup ? `成员管理 · ${memberGroup.name}` : '成员管理'}
        width={560}
        open={Boolean(memberGroup)}
        onClose={() => setMemberGroupId(null)}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Select<string>
              showSearch
              optionFilterProp="label"
              style={{ flex: 1 }}
              placeholder={usersLoading ? '加载本公司用户中…' : '选择本公司用户加入业务组'}
              loading={usersLoading}
              value={null}
              onChange={(value) => void addMember(value)}
              options={addableUsers.map((user) => ({ value: user.id, label: `${user.name}（${user.email} · ${user.department}）` }))}
              notFoundContent="没有可添加的本公司用户"
            />
          </Space.Compact>
          <Table<BusinessGroup['members'][number]>
            rowKey="id"
            size="middle"
            columns={memberColumns}
            dataSource={memberGroup?.members ?? []}
            pagination={false}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" /> }}
          />
          <Typography.Text type="secondary">成员仅可来自本公司；移除成员后将同步失去该业务组的处理权限。</Typography.Text>
        </Space>
      </Drawer>
    </div>
  )
}