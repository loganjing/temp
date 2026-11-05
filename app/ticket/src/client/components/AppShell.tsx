import { AppstoreOutlined, BarChartOutlined, FileTextOutlined, LogoutOutlined, TagsOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Space, Tag, Typography } from 'antd'
import type { ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { hasRole } from '../platform/labels'
import { useSession } from '../platform/session'
import type { UserProfile } from '../platform/types'

const { Header, Sider, Content } = Layout

interface NavItem {
  key: string
  label: string
  icon: ReactNode
  visible: (user: UserProfile) => boolean
}

const isAdmin = (user: UserProfile) => hasRole(user, 'company_admin')

const NAV_ITEMS: NavItem[] = [
  { key: '/my-tickets', label: '我的工单', icon: <FileTextOutlined />, visible: (user) => !hasRole(user, 'platform_stats') },
  { key: '/workbench', label: '工单工作台', icon: <AppstoreOutlined />, visible: (user) => isAdmin(user) || hasRole(user, 'agent') },
  { key: '/settings/groups', label: '业务组与成员', icon: <TeamOutlined />, visible: isAdmin },
  { key: '/settings/categories', label: '分类与分配规则', icon: <TagsOutlined />, visible: isAdmin },
  { key: '/settings/users', label: '用户管理', icon: <UserOutlined />, visible: isAdmin },
  { key: '/stats', label: '统计分析', icon: <BarChartOutlined />, visible: (user) => isAdmin(user) || hasRole(user, 'platform_stats') },
]

function titleFor(pathname: string): string {
  const matched = NAV_ITEMS.find((item) => pathname.startsWith(item.key))
  if (matched) return matched.label
  if (pathname.startsWith('/tickets/')) return '工单详情'
  return ''
}

export default function AppShell() {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  if (!user) return null

  const items = NAV_ITEMS.filter((item) => item.visible(user)).map((item) => ({ key: item.key, label: item.label, icon: item.icon }))
  const selectedKey = NAV_ITEMS.find((item) => location.pathname.startsWith(item.key))?.key ?? ''

  return (
    <Layout className="app-layout">
      <Sider width={224} className="app-sider" theme="dark">
        <div className="app-logo">
          <span className="app-logo-mark">工</span>
          <span>工单系统</span>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={selectedKey ? [selectedKey] : []} items={items} onClick={({ key }) => navigate(key)} />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Typography.Title level={4} className="app-header-title">
            {titleFor(location.pathname)}
          </Typography.Title>
          <Space size="middle" align="center">
            <Tag bordered={false} color="blue">
              {user.companyName}
            </Tag>
            <Space size={8} align="center">
              <Avatar size="small" style={{ backgroundColor: '#2f5bea' }}>
                {user.name.slice(0, 1)}
              </Avatar>
              <span className="app-user">
                {user.name}
                <span className="app-user-meta">{user.department}</span>
              </span>
            </Space>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
            >
              退出
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}