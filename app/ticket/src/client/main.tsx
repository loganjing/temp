import 'antd/dist/reset.css'
import './index.css'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './platform/i18n'
import { SessionProvider } from './platform/session'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2f5bea',
          colorBgLayout: '#f4f6fa',
          borderRadius: 6,
          fontSize: 14,
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#111a2c' },
          Menu: { darkItemBg: '#111a2c', darkItemSelectedBg: '#2f5bea' },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <AppProvider>
            <SessionProvider>
              <App />
            </SessionProvider>
          </AppProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)