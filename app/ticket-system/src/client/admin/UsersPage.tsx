import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiRequest } from '../platform/api-client'

type User = { id: string; name: string; email: string; phone: string | null; enabled: boolean }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [pwdUser, setPwdUser] = useState<User | null>(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [pwdForm] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const limit = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest<{ users: User[]; total: number }>(
        `/api/admin/users?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`,
      )
      setUsers(result.users)
      setTotal(result.total)
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '加载用户失败')
    } finally {
      setLoading(false)
    }
  }, [search, offset])

  useEffect(() => { void load() }, [load])

  const handleCreate = async (values: { name: string; email: string; phone?: string; password: string }) => {
    setBusy(true)
    try {
      await apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(values) })
      setCreateOpen(false)
      createForm.resetFields()
      message.success('用户已创建')
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async (user: User) => {
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !user.enabled }),
      })
      message.success(`已${user.enabled ? '停用' : '启用'} ${user.email}`)
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '更新失败')
    }
  }

  const handleEdit = async (values: { name: string; email: string; phone?: string }) => {
    if (!editUser) return
    setBusy(true)
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(editUser.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      })
      setEditUser(null)
      message.success(`已更新 ${editUser.email}`)
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '更新失败')
    } finally {
      setBusy(false)
    }
  }

  const handleResetPassword = async (values: { password: string }) => {
    if (!pwdUser) return
    setBusy(true)
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(pwdUser.id)}/password`, {
        method: 'POST',
        body: JSON.stringify(values),
      })
      setPwdUser(null)
      pwdForm.resetFields()
      message.success(`已重置 ${pwdUser.email} 的密码`)
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '重置失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={<Space><Typography.Text strong>用户管理</Typography.Text><Tag>{total}</Tag></Space>}
      extra={<Space>
        <Input.Search allowClear placeholder="搜索用户" style={{ width: 220 }} value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0) }} onSearch={load} />
        <Button icon={<ReloadOutlined />} onClick={load} size="small" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>添加用户</Button>
      </Space>}
    >
      <Table<User>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={users}
        pagination={{
          current: Math.floor(offset / limit) + 1,
          pageSize: limit,
          total,
          showSizeChanger: false,
          onChange: (page) => setOffset((page - 1) * limit),
        }}
        columns={[
          {
            title: '用户', dataIndex: 'name', key: 'user',
            render: (_, u) => <Space direction="vertical" size={0}>
              <Typography.Text strong>{u.name}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Typography.Text>
            </Space>,
          },
          { title: '手机号', dataIndex: 'phone', render: (v: string | null) => v || '—' },
          {
            title: '状态', dataIndex: 'enabled', key: 'enabled',
            render: (v: boolean) => v ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
          },
          {
            title: '操作', key: 'actions', width: 240,
            render: (_, u) => (
              <Space size={4} wrap>
                <Button size="small" onClick={() => { setEditUser(u); editForm.setFieldsValue({ name: u.name, email: u.email, phone: u.phone ?? '' }) }}>编辑</Button>
                <Button size="small" onClick={() => { setPwdUser(u); pwdForm.resetFields() }}>重置密码</Button>
                <Popconfirm title={`确认${u.enabled ? '停用' : '启用'}该用户？`} onConfirm={() => void handleToggle(u)}>
                  <Button size="small" danger={u.enabled}>{u.enabled ? '停用' : '启用'}</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal title="添加用户" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null}>
        <Form form={createForm} layout="vertical" onFinish={(v) => void handleCreate(v)}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名', max: 200 }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱', max: 320 }]}>
            <Input maxLength={320} />
          </Form.Item>
          <Form.Item name="phone" label="手机号（可选）">
            <Input />
          </Form.Item>
          <Form.Item name="password" label="临时密码" rules={[{ required: true, message: '请输入临时密码', min: 12 }]}>
            <Input.Password minLength={12} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}><Button type="primary" htmlType="submit" loading={busy} block>创建</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title={`编辑用户 · ${editUser?.email ?? ''}`} open={!!editUser} onCancel={() => setEditUser(null)} footer={null}>
        <Form form={editForm} layout="vertical" onFinish={(v) => void handleEdit(v)}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, max: 200 }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', max: 320 }]}>
            <Input maxLength={320} />
          </Form.Item>
          <Form.Item name="phone" label="手机号（可选）">
            <Input />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}><Button type="primary" htmlType="submit" loading={busy} block>保存</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title={`重置密码 · ${pwdUser?.email ?? ''}`} open={!!pwdUser} onCancel={() => setPwdUser(null)} footer={null}>
        <Form form={pwdForm} layout="vertical" onFinish={(v) => void handleResetPassword(v)}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码', min: 12 }]}>
            <Input.Password minLength={12} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}><Button type="primary" htmlType="submit" loading={busy} block>重置密码</Button></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
