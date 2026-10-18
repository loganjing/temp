import { useState } from 'react'
import { api } from '../domain/api'
import { formatDateTime, localizedUser } from '../domain/format'
import { useAsync } from '../domain/hooks'
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, TableShell, Td, Th, Truncate } from '../components/ui'
import { useLocale, usePlatformText } from '../platform/i18n'

/** 配置审计日志（需求 §6.12）：仅管理员可见，分页 20 条/页 */
export function AuditLogsPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const [page, setPage] = useState(1)
  const logs = useAsync(() => api.auditLogs(page), [page])

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-slate-800">{t('audit.title')}</h1>
      {logs.loading && !logs.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : logs.error ? (
        <ErrorBlock error={logs.error} onRetry={logs.reload} retryLabel={t('common.retry')} />
      ) : logs.data && logs.data.items.length === 0 ? (
        <EmptyBlock label={t('audit.empty')} icon="document" />
      ) : logs.data ? (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>{t('audit.col.time')}</Th>
                <Th>{t('audit.col.category')}</Th>
                <Th>{t('audit.col.actor')}</Th>
                <Th>{t('audit.col.summary')}</Th>
                <Th>{t('audit.col.detail')}</Th>
              </tr>
            </thead>
            <tbody>
              {logs.data.items.map((log) => (
                <tr key={log.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(log.createdAt)}</Td>
                  <Td className="text-slate-600">{log.category}</Td>
                  <Td>{log.actor ? localizedUser(log.actor, locale) : '—'}</Td>
                  <Td>{locale === 'zh' ? log.summaryZh : log.summaryEn}</Td>
                  <Td className="max-w-md">
                    <Truncate text={log.detail ?? ''} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination
            page={logs.data.page}
            pageSize={logs.data.pageSize}
            total={logs.data.total}
            unit={t('common.items')}
            onPage={setPage}
          />
        </>
      ) : null}
    </div>
  )
}
