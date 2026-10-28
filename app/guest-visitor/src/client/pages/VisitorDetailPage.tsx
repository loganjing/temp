import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { VisitorDetail } from '../../shared/visitor-types'
import { approveVisitor, fetchVisitorDetail, rejectVisitor } from '../api/visitors'
import ReviewDialog from '../components/ReviewDialog'
import StatusBadge from '../components/StatusBadge'

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5">
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="break-words text-sm text-neutral-900">{value || '—'}</dd>
    </div>
  )
}

export default function VisitorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<VisitorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogAction, setDialogAction] = useState<'approve' | 'reject' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const reqId = { cancelled: false }
    setLoading(true)
    setError(null)
    fetchVisitorDetail(id)
      .then((d) => { if (!reqId.cancelled) setDetail(d) })
      .catch((err) => { if (!reqId.cancelled) setError(err instanceof Error ? err.message : '加载失败') })
      .finally(() => { if (!reqId.cancelled) setLoading(false) })
    return () => { reqId.cancelled = true }
  }, [id])

  const handleConfirm = async (comment: string) => {
    if (!id || !dialogAction) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (dialogAction === 'approve') {
        await approveVisitor(id, comment)
        setToast('已通过')
      } else {
        await rejectVisitor(id, comment)
        setToast('已驳回')
      }
      setDialogAction(null)
      setTimeout(() => navigate('/'), 600)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const isPending = detail?.status === 'pending'

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-neutral-200 bg-white px-2 py-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-lg px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          ← 返回
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-neutral-900">访客详情</h1>
        <span className="w-12" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 p-3" style={{ paddingBottom: isPending ? '5rem' : undefined }}>
        {loading && (
          <div className="animate-pulse space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="h-3 w-16 rounded bg-neutral-100" />
                <div className="mt-1.5 h-4 w-40 rounded bg-neutral-200" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && detail && (
          <>
            <section className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-neutral-900">{detail.name}</h2>
                <StatusBadge status={detail.status} />
              </div>
              <dl className="divide-y divide-neutral-100">
                <Field label="手机号" value={detail.phone} />
                <Field label="身份证号" value={detail.idCard} />
                <Field label="公司" value={detail.company} />
                <Field label="访问事由" value={detail.visitReason} />
                <Field label="被访人" value={detail.hostName} />
                <Field label="预计到访时间" value={formatTime(detail.expectedVisitTime)} />
                <Field label="审批意见" value={detail.reviewComment ?? ''} />
                <Field label="审批时间" value={formatTime(detail.reviewedAt)} />
                <Field label="创建时间" value={formatTime(detail.createdAt)} />
              </dl>
            </section>

            {detail.photoUrl && (
              <section className="mt-3 rounded-lg border border-neutral-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-medium text-neutral-700">访客照片</h3>
                <img
                  src={detail.photoUrl}
                  alt="访客照片"
                  className="max-h-72 w-full rounded-lg object-contain"
                />
              </section>
            )}
          </>
        )}
      </main>

      {isPending && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-neutral-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-lg gap-3">
            <button
              type="button"
              onClick={() => { setSubmitError(null); setDialogAction('reject') }}
              className="flex-1 rounded-lg border border-red-300 bg-white py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              驳回
            </button>
            <button
              type="button"
              onClick={() => { setSubmitError(null); setDialogAction('approve') }}
              className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700"
            >
              通过
            </button>
          </div>
        </div>
      )}

      <ReviewDialog
        open={dialogAction !== null}
        action={dialogAction ?? 'approve'}
        loading={submitting}
        error={submitError ?? undefined}
        onConfirm={handleConfirm}
        onCancel={() => { if (!submitting) setDialogAction(null) }}
      />

      {toast && (
        <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-neutral-900/85 px-4 py-2 text-sm text-white">
          {toast}
        </div>
      )}
    </div>
  )
}
