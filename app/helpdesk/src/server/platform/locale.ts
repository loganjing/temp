import type { MiddlewareHandler } from 'hono'
import { createServerI18n, i18nMiddleware } from '@commonapp/i18n/server'
import en from '../../shared/locales/en.json'
import zh from '../../shared/locales/zh.json'

export const serverI18n = createServerI18n({
  resources: { en: { translation: en }, zh: { translation: zh } },
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh'],
})

export const localeMiddleware = i18nMiddleware(serverI18n) as unknown as MiddlewareHandler
