// 应用壳 — 左侧深色侧栏导航 + 顶部上下文栏 + 浅色主工作区
import { useState } from 'react'
import { Layout, Menu, theme, type MenuProps } from 'antd'
import {
  DashboardOutlined,
  WarningOutlined,
  CloudUploadOutlined,
  ToolOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import { DeviceMonitoring } from './pages/DeviceMonitoring'
import { FaultDiagnosisPage } from './pages/FaultDiagnosis'
import { RemoteUpgradePage } from './pages/RemoteUpgrade'
import { MaintenanceOrdersPage } from './pages/MaintenanceOrders'
import { EquipmentHistoryPage } from './pages/EquipmentHistory'

const { Sider, Header, Content } = Layout

type ModuleKey = 'devices' | 'faults' | 'upgrades' | 'orders' | 'history'

const navItems: MenuProps['items'] = [
  { key: 'devices', icon: <DashboardOutlined />, label: '设备监测' },
  { key: 'faults', icon: <WarningOutlined />, label: '故障诊断' },
  { key: 'upgrades', icon: <CloudUploadOutlined />, label: '远程升级' },
  { key: 'orders', icon: <ToolOutlined />, label: '维修工单' },
  { key: 'history', icon: <HistoryOutlined />, label: '设备履历' },
]

const titleMap: Record<ModuleKey, string> = {
  devices: '设备状态监测',
  faults: '故障诊断',
  upgrades: '远程升级',
  orders: '维修工单',
  history: '设备履历',
}

export default function App() {
  const [active, setActive] = useState<ModuleKey>('devices')
  const {
    token: { colorBgContainer, colorText },
  } = theme.useToken()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220} style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <div
          style={{
            height: 48,
            color: '#fff',
            textAlign: 'center',
            lineHeight: '48px',
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          设备管理系统
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
        <Header
          style={{
            background: colorBgContainer,
            padding: '0 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 500, color: colorText }}>{titleMap[active]}</span>
        </Header>
        <Content style={{ margin: 0, padding: 24, background: '#f5f5f5' }}>
          <div style={{ background: colorBgContainer, padding: 24, borderRadius: 8, minHeight: 360 }}>
            {active === 'devices' && <DeviceMonitoring />}
            {active === 'faults' && <FaultDiagnosisPage />}
            {active === 'upgrades' && <RemoteUpgradePage />}
            {active === 'orders' && <MaintenanceOrdersPage />}
            {active === 'history' && <EquipmentHistoryPage />}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
