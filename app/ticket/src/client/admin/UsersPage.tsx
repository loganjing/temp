import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest, errorFields, errorMessage } from '../platform/api-client'
import { ROLE_LABEL } from '../platform/labels'
import type { CompanyUser } from '../platform/types'

export default function UsersPage() {
  const { message } = App.useApp()
  const [users, setUsers] = useState<CompanyUser[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null)
  const [savingUser, setSavingUser] = useState(false)
  const [editForm] = Form.useForm<{ department: string; enabled: boolean }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest<{ items: CompanyUser[] }>(`/api/company-users?q=${encodeURIComponent(query)}`)
      setUsers(result.items)
      setError(null)
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  const toggleUser = async (user: CompanyUser) => {
    setBusyId(user.id)
    try {
      await apiRequest(`/api/company-users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !user.enabled }),
      })
      message.success(user.enabled ? `已停用 ${user.name}` : `已启用 ${user.name}`)
      await load()
    } catch (cause) {
      message.error(errorMessage(cause, '更新账号状态失败'))
    } finally {
      setBusyId(null)
    }
  }

  const openEdit = (user: CompanyUser) => {
    setEditingUser(user)
    editForm.setFieldsValue({ department: user.department, enabled: user.enabled })
  }

  const saveUser = async (values: { department: string; enabled: boolean }) => {
    if (!editingUser) return
    setSavingUser(true)
    try {
      await apiRequest(`/api/company-users/${encodeURIComponent(editingUser.id)}`, { method: 'PATCH', body: JSON.stringify(values) })
      message.success('用户信息已更新')
      setEditingUser(null)
      await load()
    } catch (cause) {
      const fields = errorFields(cause)
      if (fields) {
        const entries = Object.entries(fields).filter(([name]) => name === 'department' || name === 'enabled')
        editForm.setFields(entries.map(([name, error]) => ({ name: name as 'department' | 'enabled', errors: [error] })))
      }
      message.error(errorMessage(cause, '更新用户失败'))
    } finally {
      setSavingUser(false)
    }
  }

  const columns: TableProps<CompanyUser>['columns'] = [
    { title: '姓名', dataIndex: 'name', width: 140 },
    { title: '邮箱', dataIndex: 'email' },
    { title: '部门', dataIndex: 'department', width: 140 },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 200,
      render: (roles: string[]) => (
        <Space size={4} wrap>
          {roles.length === 0 ? '—' : roles.map((role) => <Tag key={role} bordered={false}>{ROLE_LABEL[role] ?? role}</Tag>)}
        </Space>
      ),
    },
    {
      title: '所属业务组',
      dataIndex: 'groups',
      width: 220,
      render: (groups: CompanyUser['groups']) => (groups.length === 0 ? '—' : groups.map((group) => group.name).join('、')),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 110,
      render: (enabled: boolean, record) => (
        <Popconfirm
          title={enabled ? '确认停用该账号？' : '确认启用该账号？'}
          okText="确认"
          cancelText="取消"
          onConfirm={() => void toggleUser(record)}
        >
          <Switch checked={enabled} loading={busyId === record.id} checkedChildren="启用" unCheckedChildren="停用" />
        </Popconfirm>
      ),
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record) => (
        <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
      ),
    },
  ]

  return (
    <div className="page">
      <Card
        size="small"
        title="用户管理"
        extra={
          <Space>
            <Input.Search
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索姓名或邮箱"
              style={{ width: 240 }}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onSearch={(value) => setQuery(value.trim())}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          仅展示本公司用户；账号由平台账号体系维护，此处可调整部门与启用状态，停用后该账号无法登录。
        </Typography.Paragraph>
        {error ? (
          <Alert type="error" showIcon message="加载用户失败" description={errorMessage(error)} action={<Button size="small" onClick={() => void load()}>重试</Button>} />
        ) : (
          <Table<CompanyUser>
            rowKey="id"
            size="middle"
            loading={loading}
            columns={columns}
            dataSource={users}
            scroll={{ x: 1080 }}
            pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `共 ${total} 位用户` }}
            locale={{ emptyText: <Empty description="暂无本公司用户" /> }}
          />
        )}
      </Card>

      <Modal
        title={editingUser ? `编辑用户 · ${editingUser.name}` : '编辑用户'}
        open={Boolean(editingUser)}
        okText="保存"
        cancelText="取消"
        confirmLoading={savingUser}
        onOk={() => editForm.submit()}
        onCancel={() => { setEditingUser(null); editForm.resetFields() }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false} onFinish={(values) => void saveUser(values)}>
          <Form.Item
            label="部门"
            name="department"
            rules={[{ required: true, message: '请填写部门' }, { max: 60, message: '部门不能超过 60 个字符' }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item label="账号状态" name="enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
