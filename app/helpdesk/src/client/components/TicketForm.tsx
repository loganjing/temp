import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../domain/api'
import { IDEMPOTENCY_KEY_PREFIX } from '../domain/constants'
import { errorText, formatBytes, localizedUser, localizedName } from '../domain/format'
import { useAsync } from '../domain/hooks'
import type { AttachmentUploadResult, Priority, SubmitAssignment, TicketDetail } from '../domain/types'
import { useLocale, usePlatformText } from '../platform/i18n'
import { Icon } from './icons'
import { Button, ErrorBlock, Field, Input, LoadingBlock, Select, Spinner, Textarea, useToast } from './ui'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const NEW_KEY_SLOT = `${IDEMPOTENCY_KEY_PREFIX}draft-new`

/** 幂等键持久化到提交完成：创建前存本地槽位，创建后挂到工单，提交后清除 */
function loadOrCreateKey(slot: string): string {
  try {
    const existing = localStorage.getItem(slot)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(slot, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

function clearStoredKey(slot: string): void {
  try {
    localStorage.removeItem(slot)
  } catch {
    /* 忽略存储不可用 */
  }
}

function storeKey(slot: string, key: string): void {
  try {
    localStorage.setItem(slot, key)
  } catch {
    /* 忽略存储不可用 */
  }
}

export interface TicketFormProps {
  ticketId?: number
  embedded?: boolean
  onDone?: () => void
}

/** 草稿创建/编辑/提交表单（标准工作台与嵌入式工作台共用） */
export function TicketForm({ ticketId, embedded = false, onDone }: TicketFormProps) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const navigate = useNavigate()

  const categories = useAsync(api.categoryOptions, [])
  const draft = useAsync<TicketDetail | null>(
    () => (ticketId ? api.getTicket(ticketId) : Promise.resolve(null)),
    [ticketId],
  )

  const [idemKey] = useState<string>(() =>
    loadOrCreateKey(ticketId ? `${IDEMPOTENCY_KEY_PREFIX}${ticketId}` : NEW_KEY_SLOT),
  )
  const [subjectZh, setSubjectZh] = useState('')
  const [subjectEn, setSubjectEn] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [subCategoryId, setSubCategoryId] = useState<number | ''>('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [attachments, setAttachments] = useState<AttachmentUploadResult[]>([])
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [validation, setValidation] = useState<string[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const prefilledRef = useRef<number | null>(null)
  useEffect(() => {
    if (!draft.data || draft.data.id === prefilledRef.current) return
    prefilledRef.current = draft.data.id
    setSubjectZh(draft.data.subjectZh ?? '')
    setSubjectEn(draft.data.subjectEn ?? '')
    setDescription(draft.data.description ?? '')
    setCategoryId(draft.data.category?.id ?? '')
    setSubCategoryId(draft.data.subCategory?.id ?? '')
    setPriority(draft.data.priority)
    setAttachments([])
  }, [draft.data])

  if (draft.loading) return <LoadingBlock label={t('common.loading')} />
  if (draft.error)
    return <ErrorBlock error={draft.error} onRetry={draft.reload} retryLabel={t('common.retry')} />
  if (ticketId && draft.data && draft.data.status !== 'draft')
    return <ErrorBlock error={t('form.notDraft')} onRetry={draft.reload} retryLabel={t('common.retry')} />

  const selectedCategory = categories.data?.find((item) => item.id === categoryId)
  const subOptions = selectedCategory?.subCategories ?? []

  function missingFields(): string[] {
    const missing: string[] = []
    if (!subjectZh.trim()) missing.push(t('form.subjectZh'))
    if (!description.trim()) missing.push(t('form.description'))
    if (!categoryId) missing.push(t('form.category'))
    return missing
  }

  function requestBody() {
    return {
      subjectZh: subjectZh.trim(),
      subjectEn: subjectEn.trim() || undefined,
      description: description.trim(),
      categoryId: categoryId as number,
      subCategoryId: subCategoryId || undefined,
      priority,
      ...(attachments.length ? { attachmentIds: attachments.map((item) => item.id) } : {}),
    }
  }

  async function saveDraft(): Promise<number | null> {
    const missing = missingFields()
    if (missing.length) {
      setValidation(missing)
      return null
    }
    setValidation(null)
    setSaving(true)
    try {
      if (!ticketId) {
        const created = await api.createDraft({ idempotencyKey: idemKey, ...requestBody() })
        storeKey(`${IDEMPOTENCY_KEY_PREFIX}${created.id}`, idemKey)
        clearStoredKey(NEW_KEY_SLOT)
        toast.success(t('form.savedDraft'))
        if (!embedded) navigate(`/tickets/${created.id}/edit`, { replace: true })
        return created.id
      }
      await api.updateDraft(ticketId, requestBody())
      toast.success(t('form.savedDraft'))
      return ticketId
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
      return null
    } finally {
      setSaving(false)
    }
  }

  async function submitTicket() {
    if (submitting) return
    const missing = missingFields()
    if (missing.length) {
      setValidation(missing)
      return
    }
    setValidation(null)
    setSubmitting(true)
    try {
      let id = ticketId
      if (!id) {
        const created = await api.createDraft({ idempotencyKey: idemKey, ...requestBody() })
        storeKey(`${IDEMPOTENCY_KEY_PREFIX}${created.id}`, idemKey)
        clearStoredKey(NEW_KEY_SLOT)
        id = created.id
      } else {
        await api.updateDraft(id, requestBody())
      }
      const result = await api.submitDraft(id, idemKey)
      clearStoredKey(`${IDEMPOTENCY_KEY_PREFIX}${id}`)
      toast.success(assignmentText(result.assignment))
      if (embedded) onDone?.()
      else navigate(`/tickets/${id}`, { replace: true })
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setSubmitting(false)
    }
  }

  function assignmentText(assignment: SubmitAssignment): string {
    if (assignment.result === 'assigned') {
      const person = assignment.assignee ? localizedUser(assignment.assignee, locale) : t('form.unknownAssignee')
      return t('form.submitAssigned', { person })
    }
    return t('form.submitPending')
  }

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(t('form.attachment.tooLarge', { name: file.name }))
        continue
      }
      setUploading(true)
      try {
        const uploaded = await api.uploadAttachment(file, ticketId)
        setAttachments((current) => [...current, uploaded])
      } catch (error) {
        toast.error(errorText(error, t('common.error.generic')))
      } finally {
        setUploading(false)
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          {ticketId ? t('form.editTitle') : t('form.createTitle')}
        </h2>
        {validation && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {t('form.validation.missing')}: {validation.join('、')}
          </div>
        )}
        <div className="space-y-4">
          <Field label={t('form.subjectZh')} required>
            <Input value={subjectZh} onChange={(event) => setSubjectZh(event.target.value)} maxLength={200} />
          </Field>
          <Field label={t('form.subjectEn')}>
            <Input value={subjectEn} onChange={(event) => setSubjectEn(event.target.value)} maxLength={200} />
          </Field>
          <Field label={t('form.description')} required>
            <Textarea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t('form.category')} required>
              <Select
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value ? Number(event.target.value) : '')
                  setSubCategoryId('')
                }}
              >
                <option value="">—</option>
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {localizedName(category, locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('form.subCategory')}>
              <Select
                value={subCategoryId}
                onChange={(event) => setSubCategoryId(event.target.value ? Number(event.target.value) : '')}
                disabled={!subOptions.length}
              >
                <option value="">—</option>
                {subOptions.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {localizedName(sub, locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('form.priority')} required>
              <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                <option value="low">{t('ticket.priority.low')}</option>
                <option value="medium">{t('ticket.priority.medium')}</option>
                <option value="high">{t('ticket.priority.high')}</option>
                <option value="urgent">{t('ticket.priority.urgent')}</option>
              </Select>
            </Field>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{t('form.attachment.label')}</span>
              <Button
                icon="upload"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                variant="secondary"
              >
                {uploading ? t('form.attachment.uploading') : t('form.attachment.add')}
              </Button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={onFiles} />
            </div>
            <p className="text-xs text-slate-400">{t('form.attachment.limit')}</p>
            <ul className="mt-2 space-y-1">
              {attachments.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <span className="flex items-center gap-2 text-slate-700">
                    <Icon name="paperclip" className="h-4 w-4 text-slate-400" />
                    <span className="max-w-xs truncate" title={item.fileName}>
                      {item.fileName}
                    </span>
                    <span className="text-xs text-slate-400">{formatBytes(item.sizeBytes)}</span>
                  </span>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-600"
                    onClick={() => setAttachments((current) => current.filter((a) => a.id !== item.id))}
                  >
                    {t('common.remove')}
                  </button>
                </li>
              ))}
            </ul>
            {ticketId ? <p className="mt-1 text-xs text-slate-400">{t('form.attachment.existingHint')}</p> : null}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        {saving && <Spinner className="h-4 w-4" />}
        <Button onClick={() => void saveDraft()} disabled={saving || submitting}>
          {t('form.saveDraft')}
        </Button>
        <Button variant="primary" onClick={() => void submitTicket()} disabled={saving || submitting}>
          {submitting ? t('form.submitting') : t('form.submit')}
        </Button>
      </div>
    </div>
  )
}
