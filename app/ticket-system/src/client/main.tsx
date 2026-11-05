import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { AppProvider } from './platform/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1458a6',
          borderRadius: 6,
        },
        components: {
          Layout: {
            siderBg: '#001529',
            headerBg: '#ffffff',
            headerHeight: 56,
            bodyBg: '#f4f6f8',
          },
        },
      }}
    >
      <AppProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProvider>
    </ConfigProvider>
  </StrictMode>,
)
