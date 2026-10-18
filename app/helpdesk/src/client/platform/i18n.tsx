// 客户端界面文案：资源置于 src/client/locales/，与并行任务拥有的 src/shared/ 解耦。
// 使用 TS 模块而非 JSON（tsconfig 未开启 resolveJsonModule，且配置文件不在本任务写入范围）。
import { createI18n } from '@commonapp/i18n'
import { en } from '../locales/en'
import { zh } from '../locales/zh'
import { setApiLocale } from './api-client'

const client = createI18n({
  resources: { en: { translation: en }, zh: { translation: zh } },
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh'],
  defaultLng: 'zh',
})

// 界面语言与服务端 Accept-Language 保持同步（模块初始化 + 语言切换订阅）
setApiLocale(client.getLocale())
client.subscribeLocale(() => setApiLocale(client.getLocale()))

export const AppProvider = client.I18nProvider
export const usePlatformText = client.useT
export const useLocale = client.useLocale
