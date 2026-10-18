import { createI18n } from '@commonapp/i18n'
import en from '../../shared/locales/en.json'
import zh from '../../shared/locales/zh.json'

const client = createI18n({
  resources: { en: { translation: en }, zh: { translation: zh } },
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh'],
  defaultLng: 'zh',
})

export const AppProvider = client.I18nProvider
export const usePlatformText = client.useT
export const useLocale = client.useLocale
