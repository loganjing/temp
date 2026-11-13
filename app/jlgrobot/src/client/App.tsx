import { Layout, Menu, theme } from 'antd'
import {
  DesktopOutlined,
  WarningOutlined,
  CloudUploadOutlined,
  ToolOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import EquipmentPage from './pages/EquipmentPage'
import FaultsPage from './pages/FaultsPage'
import UpgradesPage from './pages/UpgradesPage'
import WorkOrdersPage from './pages/WorkOrdersPage'
import HistoryPage from './pages/HistoryPage'

const { Sider, Header, Content } = Layout

const menuItems = [
  { key: '/equipment', icon: <DesktopOutlined />, label: '设备状态监测' },
  { key: '/faults', icon: <WarningOutlined />, label: '故障诊断' },
  { key: '/upgrades', icon: <CloudUploadOutlined />, label: '远程升级' },
  { key: '/work-orders', icon: <ToolOutlined />, label: '维修工单' },
  { key: '/history', icon: <HistoryOutlined />, label: '设备履历' },
]

const moduleLabels: Record<string, string> = {
  '/equipment': '设备状态监测',
  '/faults': '故障诊断',
  '/upgrades': '远程升级',
  '/work-orders': '维修工单',
  '/history': '设备履历',
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { token } = theme.useToken()

  const currentPath = '/' + location.pathname.split('/')[1]
  const headerTitle = moduleLabels[currentPath] ?? '设备管理平台'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220} style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <div
          style={{
            height: 48,
            margin: 16,
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: '48px',
          }}
        >
          设备管理平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentPath]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            fontSize: 16,
            fontWeight: 500,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {headerTitle}
        </Header>
        <Content style={{ padding: 24, background: token.colorBgLayout }}>
          <Routes>
            <Route path="/equipment" element={<EquipmentPage />} />
            <Route path="/faults" element={<FaultsPage />} />
            <Route path="/upgrades" element={<UpgradesPage />} />
            <Route path="/work-orders" element={<WorkOrdersPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/equipment" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
