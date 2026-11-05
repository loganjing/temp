import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { PlusOutlined, ReloadOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import { businessGroupApi } from '../api/ticket-client'
import type { BusinessGroup } from '../api/types'
import { ErrorView, LoadingView } from '../components/StateViews'
import { formatDateTime } from '../constants'

export default function GroupsPage() {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [active, setActive] = useState<BusinessGroup | null>(null)
  const [memberOpen, setMemberOpen] = useState(false)
  const [createForm] = Form.useForm()
  const [memberForm] = Form.useForm()
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await businessGroupApi.list()
      setGroups(r.groups)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载业务组失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleCreate = async (values: { name: string }) => {
    setBusy(true)
    try {
      await businessGroupApi.create(values.name)
      setCreateOpen(false)
      createForm.resetFields()
      message.success('业务组已创建')
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const handleAddMember = async (values: { userId: string }) => {
    if (!active) return
    setBusy(true)
    try {
      await businessGroupApi.addMember(active.id, values.userId)
      memberForm.resetFields()
      message.success('成员已添加')
      await load()
      setActive((prev) => prev ? groups.find((g) => g.id === prev.id) ?? prev : prev)
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '添加成员失败')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveMember = async (groupId: string, userId: string, userName: string) => {
    try {
      await businessGroupApi.removeMember(groupId, userId)
      message.success(`已移除 ${userName}`)
      await load()
      setActive((prev) => prev ? groups.find((g) => g.id === prev.id) ?? prev : prev)
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '移除成员失败')
    }
  }

  if (loading && groups.length === 0) return <LoadingView tip="加载业务组…" />
  if (error) return <ErrorView message={error} onRetry={load} />

  return (
    <Card
      title={<Space><TeamOutlined />业务组管理（{groups.length}）</Space>}
      extra={<Space>
        <Button icon={<ReloadOutlined />} onClick={load} size="small" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建业务组</Button>
      </Space>}
    >
      {groups.length === 0 ? (
        <Empty description="暂无业务组">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建业务组</Button>
        </Empty>
      ) : (
        <List
          grid={{ gutter: 16, xs: 1, sm: 2, lg: 3 }}
          dataSource={groups}
          renderItem={(g) => (
            <List.Item>
              <Card
                size="small"
                title={g.name}
                extra={<Tag>{g.members.length} 成员</Tag>}
                actions={[
                  <Button type="link" icon={<UserAddOutlined />} onClick={() => { setActive(g); setMemberOpen(true) }}>管理成员</Button>,
                ]}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>创建于 {formatDateTime(g.createdAt)}</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  {g.members.length === 0 ? (
                    <Typography.Text type="secondary">暂无成员</Typography.Text>
                  ) : (
                    <Space wrap size={4}>
                      {g.members.map((m) => (
                        <Tag key={m.userId} closable onClose={(e) => { e.preventDefault(); void handleRemoveMember(g.id, m.userId, m.userName) }}>
                          {m.userName}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}

      <Drawer title="新建业务组" open={createOpen} onClose={() => setCreateOpen(false)} width={400}>
        <Form form={createForm} layout="vertical" onFinish={(v) => void handleCreate(v)}>
          <Form.Item name="name" label="业务组名称" rules={[{ required: true, message: '请输入名称', min: 1, max: 100 }]}>
            <Input maxLength={100} placeholder="例如：网络运维组" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}><Button type="primary" htmlType="submit" loading={busy} block>创建</Button></Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={active ? `成员管理 · ${active.name}` : '成员管理'}
        open={memberOpen}
        onClose={() => setMemberOpen(false)}
        width={460}
      >
        {active && (
          <>
            <Form form={memberForm} layout="inline" onFinish={(v) => void handleAddMember(v)} style={{ marginBottom: 16 }}>
              <Form.Item name="userId" rules={[{ required: true, message: '请输入用户 ID' }]}>
                <Input placeholder="用户 ID" />
              </Form.Item>
              <Form.Item><Button type="primary" htmlType="submit" loading={busy} icon={<UserAddOutlined />}>添加</Button></Form.Item>
            </Form>
            <List
              size="small"
              bordered
              dataSource={active.members}
              locale={{ emptyText: '暂无成员' }}
              renderItem={(m) => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="remove"
                      title={`移除 ${m.userName}？`}
                      onConfirm={() => void handleRemoveMember(active.id, m.userId, m.userName)}
                    >
                      <Button type="link" danger size="small">移除</Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta title={m.userName} description={m.userEmail} />
                </List.Item>
              )}
            />
          </>
        )}
      </Drawer>
    </Card>
  )
}
