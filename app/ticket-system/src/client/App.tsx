import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Layout,
  Menu,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import {
  BarChartOutlined,
  DashboardOutlined,
  FilterOutlined,
  FormOutlined,
  LogoutOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { authApi } from './api/ticket-client'
import type { CurrentUser } from './api/types'
import UsersPage from './admin/UsersPage'
import WorkbenchPage from './pages/WorkbenchPage'
import CreateTicketPage from './pages/CreateTicketPage'
import TicketDetailPage from './pages/TicketDetailPage'
import GroupsPage from './pages/GroupsPage'
import CategoryRulesPage from './pages/CategoryRulesPage'
import StatisticsPage from './pages/StatisticsPage'

const { Sider, Header, Content } = Layout

type AuthState = 'checking' | 'required' | 'login' | 'authenticated'

const NAV_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/tickets/new', icon: <FormOutlined />, label: '创建工单' },
  { key: '/groups', icon: <TeamOutlined />, label: '业务组管理' },
  { key: '/category-rules', icon: <FilterOutlined />, label: '分类规则' },
  { key: '/statistics', icon: <BarChartOutlined />, label: '统计仪表盘' },
  { key: '/admin/users', icon: <UserOutlined />, label: '用户管理' },
]

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 'min(440px, calc(100% - 2rem))' }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>{title}</Typography.Title>
        <Typography.Paragraph type="secondary">{subtitle}</Typography.Paragraph>
        {children}
      </Card>
    </div>
  )
}

export default function App() {
  const navigate = useNavigate()
  const [state, setState] = useState<AuthState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [pwdRequired, setPwdRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loginForm] = Form.useForm()
  const [bootstrapForm] = Form.useForm()
  const [pwdForm] = Form.useForm()

  const refresh = async () => {
    try {
      const me = await authApi.me()
      setUser(me)
      setPwdRequired(me.passwordChangeRequired)
      setState('authenticated')
      return
    } catch {
      localStorage.removeItem('platform-token')
    }
    try {
      const status = await authApi.bootstrapStatus()
      setState(status.required ? 'required' : 'login')
    } catch {
      setState('login')
    }
  }

  useEffect(() => { void refresh().catch(() => setState('login')) }, [])

  const onLogin = async (values: { email: string; password: string }) => {
    setBusy(true)
    try {
      const result = await authApi.login(values.email, values.password)
      localStorage.setItem('platform-token', result.token)
      setUser(result.user)
      setPwdRequired(result.user.passwordChangeRequired)
      setState('authenticated')
      loginForm.resetFields()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  const onBootstrap = async (values: { name: string; email: string; password: string }) => {
    setBusy(true)
    try {
      await authApi.bootstrap(values.name, values.email, values.password)
      bootstrapForm.resetFields()
      message.success('账户已创建，请登录')
      setState('login')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '创建账户失败')
    } finally {
      setBusy(false)
    }
  }

  const onChangePassword = async (values: { password: string }) => {
    setBusy(true)
    try {
      await authApi.changePassword(values.password)
      setPwdRequired(false)
      setUser((prev) => prev ? { ...prev, passwordChangeRequired: false } : prev)
      pwdForm.resetFields()
      message.success('密码已更新')
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '更新密码失败')
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
    navigate('/')
  }

  if (state === 'checking') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" tip="加载中…" /></div>
  }

  if (state === 'required') {
    return (
      <AuthCard title="创建首个账户" subtitle="仅在系统无用户时可执行一次。">
        <Form form={bootstrapForm} layout="vertical" onFinish={(v) => void onBootstrap(v)}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, max: 200 }]}>
            <Input autoComplete="name" maxLength={200} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', max: 320 }]}>
            <Input autoComplete="email" maxLength={320} />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 12, message: '密码至少 12 位' }]}>
            <Input.Password autoComplete="new-password" minLength={12} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={busy} block>创建账户</Button>
          </Form.Item>
        </Form>
      </AuthCard>
    )
  }

  if (state === 'login') {
    return (
      <AuthCard title="登录" subtitle="使用本地账户登录工单系统。">
        <Form form={loginForm} layout="vertical" onFinish={(v) => void onLogin(v)}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={busy} block>登录</Button>
          </Form.Item>
        </Form>
      </AuthCard>
    )
  }

  if (!user) return null

  if (pwdRequired) {
    return (
      <AuthCard title="更改临时密码" subtitle="继续使用前请设置新密码。">
        <Form form={pwdForm} layout="vertical" onFinish={(v) => void onChangePassword(v)}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 12, message: '密码至少 12 位' }]}>
            <Input.Password autoComplete="new-password" minLength={12} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={busy} block>更新密码</Button>
          </Form.Item>
        </Form>
      </AuthCard>
    )
  }

  const selectedKeys = () => {
    const path = window.location.pathname
    if (path.startsWith('/tickets/new')) return ['/tickets/new']
    if (path.startsWith('/tickets/')) return ['/']
    if (path.startsWith('/admin/users')) return ['/admin/users']
    return [path]
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="dark" breakpoint="lg" collapsedWidth={0}>
        <div style={{ height: 56, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 600 }}>
          工单系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys()}
          items={NAV_ITEMS.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: <NavLink to={item.key}>{item.label}</NavLink>,
          }))}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>工单管理系统</Typography.Title>
          <Space>
            <Avatar size="small" icon={<UserOutlined />} />
            <Typography.Text>{user.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{user.email}</Typography.Text>
            <Button type="text" icon={<LogoutOutlined />} onClick={signOut}>退出</Button>
          </Space>
        </Header>
        <Content style={{ padding: 20 }}>
          <Routes>
            <Route path="/" element={<WorkbenchPage />} />
            <Route path="/tickets/new" element={<CreateTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/category-rules" element={<CategoryRulesPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="*" element={<WorkbenchPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
