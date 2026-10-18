import { useState, type FormEvent } from 'react'
import { Badge, Card } from '../ui'
import { displayDateTime } from '../../lib/format'
import { apiRequest, errorText } from '../../platform/api-client'
import type { AiSuggestion } from '../../types'

type ConfirmResult = { derivedPlan?: { id: string }; marketEntries?: string[] }

/**
 * AI 建议面板（AC-15）：market-summary / plan-adjustment 共用“生成→人工确认→驳回”流。
 * 服务端 provider 未配置时返回 502 AI_PROVIDER_UNAVAILABLE（无部分写入）；确认前不影响业务数据。
 */
export default function AiSuggestionPanel({
  parcelId,
  kind,
  targetPlanId,
  canGenerate,
  canConfirm,
  promptPlaceholder,
  onConfirmed,
}: {
  parcelId: string
  kind: 'market-summary' | 'plan-adjustment'
  targetPlanId?: string | null
  canGenerate: boolean
  canConfirm: boolean
  promptPlaceholder?: string
  onConfirmed?: (result: ConfirmResult) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setSuggestion(
        await apiRequest<AiSuggestion>('/api/ai/suggestions', {
          method: 'POST',
          body: JSON.stringify({
            parcelId,
            kind,
            prompt: prompt.trim() === '' ? null : prompt.trim(),
            ...(kind === 'plan-adjustment' ? { targetPlanId: targetPlanId ?? null } : {}),
          }),
        }),
      )
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!suggestion) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest<{ suggestion: AiSuggestion } & ConfirmResult>(
        `/api/ai/suggestions/${encodeURIComponent(suggestion.id)}/confirm`,
        { method: 'POST' },
      )
      setSuggestion(result.suggestion)
      setNotice('建议已确认。')
      onConfirmed?.({ derivedPlan: result.derivedPlan, marketEntries: result.marketEntries })
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    if (!suggestion) return
    setBusy(true)
    setError('')
    try {
      setSuggestion(
        await apiRequest<AiSuggestion>(`/api/ai/suggestions/${encodeURIComponent(suggestion.id)}/dismiss`, { method: 'POST' }),
      )
      setNotice('建议已驳回。')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={kind === 'market-summary' ? 'AI 市场汇总建议' : 'AI 方案调整建议'}>
      <p className="hint">
        建议由外部 AI provider 生成（服务端 AI_PROVIDER_URL 配置），需人工确认后才写入业务数据；来源默认 unverified。
      </p>
      {canGenerate && (
        <form className="form-grid" onSubmit={(event) => void create(event)}>
          <label className="span-2">
            提示语（可选）
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              maxLength={4000}
              placeholder={promptPlaceholder}
            />
          </label>
          <button disabled={busy}>{busy ? '生成中…' : '生成建议'}</button>
        </form>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="success">{notice}</p>}
      {suggestion && (
        <div className="stack">
          <div className="row-actions" style={{ alignItems: 'center' }}>
            <Badge tone={suggestion.status === 'confirmed' ? 'ok' : suggestion.status === 'dismissed' ? 'neutral' : 'info'}>
              {suggestion.status}
            </Badge>
            <span className="hint">创建于 {displayDateTime(suggestion.createdAt)}</span>
          </div>
          {suggestion.content !== null && <pre className="ai-content">{JSON.stringify(suggestion.content, null, 2)}</pre>}
          {suggestion.sources.length > 0 && (
            <div className="chips">
              {suggestion.sources.map((source, index) => (
                <Badge
                  key={`${source.refType}-${index}`}
                  tone={source.confidence === 'verified' ? 'ok' : source.confidence === 'probable' ? 'warning' : 'danger'}
                >
                  {`${source.refType}${source.refId ? `（${source.refId}）` : ''}${source.note ? `：${source.note}` : ''}`}
                </Badge>
              ))}
            </div>
          )}
          {suggestion.status === 'pending' && (
            <div className="row-actions">
              {canConfirm && <button disabled={busy} onClick={() => void confirm()}>确认建议</button>}
              <button className="secondary" disabled={busy} onClick={() => void dismiss()}>驳回</button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
