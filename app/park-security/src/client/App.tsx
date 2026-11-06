import { useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  EnvironmentOutlined,
  VideoCameraOutlined,
  AlertOutlined,
  ToolOutlined,
  FileSearchOutlined,
} from '@ant-design/icons'
import PatrolRoutes from './pages/PatrolRoutes'
import Events from './pages/Events'
import Alerts from './pages/Alerts'
import Handling from './pages/Handling'
import Trails from './pages/Trails'

const { Sider, Content, Header } = Layout

type ModuleKey = 'patrol-routes' | 'events' | 'alerts' | 'handling' | 'trails'

const navItems = [
  { key: 'patrol-routes', icon: <EnvironmentOutlined />, label: '巡逻路线' },
  { key: 'events', icon: <VideoCameraOutlined />, label: '视频事件' },
  { key: 'alerts', icon: <AlertOutlined />, label: '实时告警' },
  { key: 'handling', icon: <ToolOutlined />, label: '处置管理' },
  { key: 'trails', icon: <FileSearchOutlined />, label: '事件留痕' },
]

const titles: Record<ModuleKey, string> = {
  'patrol-routes': '巡逻路线配置',
  'events': '视频事件识别',
  'alerts': '实时告警',
  'handling': '处置管理',
  'trails': '事件留痕',
}

export default function App() {
  const [active, setActive] = useState<ModuleKey>('patrol-routes')
  const { token } = theme.useToken()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 16 }}>
          园区安防管理
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[active]}
          items={navItems}
          onClick={(e) => setActive(e.key as ModuleKey)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: '0 24px', fontSize: 18, fontWeight: 600, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          {titles[active]}
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          {active === 'patrol-routes' && <PatrolRoutes />}
          {active === 'events' && <Events />}
          {active === 'alerts' && <Alerts />}
          {active === 'handling' && <Handling />}
          {active === 'trails' && <Trails />}
        </Content>
      </Layout>
    </Layout>
  )
}
