import { useState } from 'react'
import { api } from '../domain/api'
import { errorText, localizedName } from '../domain/format'
import { useAsync } from '../domain/hooks'
import type { SlaPolicy } from '../domain/types'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  TableShell,
  Td,
  Th,
  useToast,
} from '../components/ui'
import { useLocale, usePlatformText } from '../platform/i18n'

/** SLA 策略配置（需求 §6.9）：按一级分类配置双时钟时限 + 未配置提醒 + 表头规则说明 */
export function SlaPoliciesPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const [version, setVersion] = useState(0)
  const policies = useAsync(() => api.slaPolicies(), [version])
  const [editing, setEditing] = useState<SlaPolicy | 'new' | null>(null)

  const unconfigured = policies.data?.unconfiguredCategories ?? []

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('slaPolicy.title')}</h1>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => setEditing('new')}
          disabled={unconfigured.length === 0}
        >
          {t('slaPolicy.create')}
        </Button>
      </header>

      {unconfigured.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">{t('slaPolicy.unconfigured')}</p>
          <p className="mt-1">{unconfigured.map((category) => localizedName(category, locale)).join('、')}</p>
        </div>
      )}

      {policies.loading && !policies.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : policies.error ? (
        <ErrorBlock error={policies.error} onRetry={policies.reload} retryLabel={t('common.retry')} />
      ) : policies.data && policies.data.items.length === 0 ? (
        <EmptyBlock label={t('slaPolicy.empty')} icon="clock" />
      ) : policies.data ? (
        <TableShell>
          <thead>
            <tr>
              <Th>{t('common.category')}</Th>
              <Th help={t('slaPolicy.helpFirstResponse')}>{t('sla.firstResponse')}</Th>
              <Th help={t('slaPolicy.helpResolution')}>{t('sla.resolution')}</Th>
              <Th>{t('slaPolicy.warnThreshold')}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {policies.data.items.map((policy) => (
              <tr key={policy.id}>
                <Td>{localizedName(policy.category, locale)}</Td>
                <Td className="text-slate-600">
                  {policy.firstResponseMinutes} {t('common.minutes')}
                </Td>
                <Td className="text-slate-600">
                  {policy.resolutionMinutes} {t('common.minutes')}
                </Td>
                <Td className="text-slate-600">
                  {policy.warnThresholdPercent != null ? `${policy.warnThresholdPercent}%` : '—'}
                </Td>
                <Td>
                  <Button icon="edit" onClick={() => setEditing(policy)}>
                    {t('common.edit')}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      ) : null}

      {editing && (
        <SlaPolicyModal policy={editing} unconfigured={unconfigured} onClose={() => setEditing(null)} onSaved={() => setVersion((v) => v + 1)} />
      )}
    </div>
  )
}

function SlaPolicyModal({
  policy,
  unconfigured,
  onClose,
  onSaved,
}: {
  policy: SlaPolicy | 'new'
  unconfigured: { id: number; nameZh: string; nameEn: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const editing = typeof policy === 'object' ? policy : null
  const selectable = typeof policy === 'object' ? [policy.category] : unconfigured
  const [categoryId, setCategoryId] = useState<number | ''>(editing?.category.id ?? '')
  const [firstResponseMinutes, setFirstResponseMinutes] = useState(String(editing?.firstResponseMinutes ?? ''))
  const [resolutionMinutes, setResolutionMinutes] = useState(String(editing?.resolutionMinutes ?? ''))
  const [warnThresholdPercent, setWarnThresholdPercent] = useState(
    editing?.warnThresholdPercent != null ? String(editing.warnThresholdPercent) : '',
  )
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    const first = Number(firstResponseMinutes)
    const resolution = Number(resolutionMinutes)
    const warn = warnThresholdPercent.trim() === '' ? undefined : Number(warnThresholdPercent)
    if (!categoryId || !Number.isFinite(first) || first <= 0 || !Number.isFinite(resolution) || resolution <= 0) {
      toast.error(t('form.validation.missing'))
      return
    }
    if (warn !== undefined && (!Number.isFinite(warn) || warn < 0 || warn > 100)) {
      toast.error(t('slaPolicy.warnInvalid'))
      return
    }
    setBusy(true)
    try {
      const body = { categoryId, firstResponseMinutes: first, resolutionMinutes: resolution, warnThresholdPercent: warn }
      if (editing) await api.updateSlaPolicy(editing.id, body)
      else await api.createSlaPolicy(body)
      toast.success(t('common.saved'))
      onSaved()
      onClose()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={editing ? t('slaPolicy.edit') : t('slaPolicy.create')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? t('common.busy') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.category')} required>
          <Select
            value={categoryId}
            onChange={(event) => setCategoryId(Number(event.target.value) || '')}
            disabled={!!editing}
          >
            <option value="">—</option>
            {selectable.map((category) => (
              <option key={category.id} value={category.id}>
                {localizedName(category, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`${t('sla.firstResponse')}（${t('common.minutes')}）`} required>
          <Input type="number" min={1} value={firstResponseMinutes} onChange={(event) => setFirstResponseMinutes(event.target.value)} />
        </Field>
        <Field label={`${t('sla.resolution')}（${t('common.minutes')}）`} required>
          <Input type="number" min={1} value={resolutionMinutes} onChange={(event) => setResolutionMinutes(event.target.value)} />
        </Field>
        <Field label={t('slaPolicy.warnThreshold')}>
          <Input
            type="number"
            min={0}
            max={100}
            value={warnThresholdPercent}
            onChange={(event) => setWarnThresholdPercent(event.target.value)}
            placeholder="0 ~ 100"
          />
        </Field>
        <p className="text-xs text-slate-400">{t('slaPolicy.helpFirstResponse')}</p>
        <p className="text-xs text-slate-400">{t('slaPolicy.helpResolution')}</p>
      </div>
    </Modal>
  )
}
