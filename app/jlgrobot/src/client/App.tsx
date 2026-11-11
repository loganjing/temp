import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import type { ReactNode } from 'react'
import {
  DashboardOutlined,
  WarningOutlined,
  CloudUploadOutlined,
  ToolOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import EquipmentStatusPage from './pages/EquipmentStatusPage'
import FaultDiagnosisPage from './pages/FaultDiagnosisPage'
import UpgradePage from './pages/UpgradePage'
import WorkOrderPage from './pages/WorkOrderPage'
import EquipmentHistoryPage from './pages/EquipmentHistoryPage'
import { useT, type MessageKey } from './platform/i18n'

const { Sider, Header, Content } = Layout

interface NavEntry {
  key: string
  path: string
  labelKey: MessageKey
  descKey: MessageKey
  icon: ReactNode
}

const NAV_ENTRIES: NavEntry[] = [
  { key: 'equipment-status', path: '/', labelKey: 'nav.equipment-status', descKey: 'nav.equipment-status.desc', icon: <DashboardOutlined /> },
  { key: 'fault-diagnosis', path: '/faults', labelKey: 'nav.fault-diagnosis', descKey: 'nav.fault-diagnosis.desc', icon: <WarningOutlined /> },
  { key: 'upgrade', path: '/upgrades', labelKey: 'nav.upgrade', descKey: 'nav.upgrade.desc', icon: <CloudUploadOutlined /> },
  { key: 'work-order', path: '/work-orders', labelKey: 'nav.work-order', descKey: 'nav.work-order.desc', icon: <ToolOutlined /> },
  { key: 'equipment-history', path: '/history', labelKey: 'nav.equipment-history', descKey: 'nav.equipment-history.desc', icon: <HistoryOutlined /> },
]

function TopBar() {
  const t = useT()
  const location = useLocation()
  const current = NAV_ENTRIES.find((e) => e.path === location.pathname) ?? NAV_ENTRIES[0]
  return (
    <Header className="app-topbar">
      <h1>{t(current.labelKey)}</h1>
      <span className="topbar-desc">{t(current.descKey)}</span>
    </Header>
  )
}

function Shell() {
  const t = useT()
  const location = useLocation()
  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={224} theme="dark">
        <div className="app-brand">
          {t('app.title')}
          <div className="app-brand-sub">{t('app.subtitle')}</div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={NAV_ENTRIES.map((e) => ({
            key: e.path,
            icon: e.icon,
            label: <NavLink to={e.path}>{t(e.labelKey)}</NavLink>,
          }))}
        />
      </Sider>
      <Layout className="app-body">
        <TopBar />
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<EquipmentStatusPage />} />
            <Route path="/faults" element={<FaultDiagnosisPage />} />
            <Route path="/upgrades" element={<UpgradePage />} />
            <Route path="/work-orders" element={<WorkOrderPage />} />
            <Route path="/history" element={<EquipmentHistoryPage />} />
            <Route path="*" element={<EquipmentStatusPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
