import { Layout, Menu } from 'antd'
import {
  AlertOutlined,
  CloudSyncOutlined,
  DesktopOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useLocation } from 'react-router-dom'
import { Link, Route, Routes } from 'react-router-dom'
import DevicesPage from './pages/DevicesPage'
import FaultsPage from './pages/FaultsPage'
import UpgradesPage from './pages/UpgradesPage'
import RepairOrdersPage from './pages/RepairOrdersPage'
import DeviceHistoryPage from './pages/DeviceHistoryPage'

const { Sider, Header, Content } = Layout

type MenuItem = Required<MenuProps>['items'][number]

const MODULES: { key: string; path: string; label: string; icon: React.ReactNode }[] = [
  { key: 'devices', path: '/devices', label: '设备监测', icon: <DesktopOutlined /> },
  { key: 'faults', path: '/faults', label: '故障诊断', icon: <AlertOutlined /> },
  { key: 'upgrades', path: '/upgrades', label: '远程升级', icon: <CloudSyncOutlined /> },
  { key: 'repair-orders', path: '/repair-orders', label: '维修工单', icon: <ToolOutlined /> },
  { key: 'history', path: '/history', label: '设备履历', icon: <UnorderedListOutlined /> },
]

const menuItems: MenuItem[] = MODULES.map((m) => ({
  key: m.key,
  icon: m.icon,
  label: <Link to={m.path}>{m.label}</Link>,
}))

function currentModuleLabel(pathname: string): string {
  const match = MODULES.find((m) => pathname.startsWith(m.path))
  return match?.label ?? '设备管理平台'
}

export default function App() {
  const location = useLocation()
  const selectedKey = MODULES.find((m) => location.pathname.startsWith(m.path))?.key ?? 'devices'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        width={220}
        style={{ position: 'sticky', top: 0, height: '100vh' }}
        breakpoint="lg"
        collapsedWidth={0}
      >
        <div
          style={{
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            padding: '20px 24px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          k12-robot 设备管理
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          {currentModuleLabel(location.pathname)}
        </Header>
        <Content style={{ padding: 24, background: '#f5f5f5' }}>
          <Routes>
            <Route path="/" element={<DevicesPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/faults" element={<FaultsPage />} />
            <Route path="/upgrades" element={<UpgradesPage />} />
            <Route path="/repair-orders" element={<RepairOrdersPage />} />
            <Route path="/history" element={<DeviceHistoryPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
