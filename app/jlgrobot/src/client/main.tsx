import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'
import './styles.css'
import App from './App'
import { AppProvider } from './platform/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <AppProvider>
        <App />
      </AppProvider>
    </ConfigProvider>
  </StrictMode>,
)
