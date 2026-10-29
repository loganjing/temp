import { useEffect, useState } from 'react'
import { apiRequest } from './platform/api-client'
import { usePlatformText } from './platform/i18n'

export default function App() {
  const t = usePlatformText()
  const [health, setHealth] = useState<'checking' | 'ok' | 'down'>('checking')

  useEffect(() => {
    apiRequest<{ ok: boolean }>('/api/health')
      .then((d) => setHealth(d.ok ? 'ok' : 'down'))
      .catch(() => setHealth('down'))
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem', maxWidth: 640, margin: '0 auto' }}>
      <h1>jlg-ticket</h1>
      <p>{t('intro')}</p>
      <p>
        {t('health')}:
        {health === 'checking' && t('checking')}
        {health === 'ok' && t('ok')}
        {health === 'down' && t('down')}
      </p>
    </main>
  )
}
