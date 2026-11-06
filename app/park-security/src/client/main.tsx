import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { AppProvider } from './platform/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1677ff' } }}>
      <AntdApp>
        <AppProvider><App /></AppProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
