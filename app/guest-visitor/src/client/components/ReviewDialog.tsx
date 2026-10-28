import { useEffect, useState } from 'react'

interface ReviewDialogProps {
  open: boolean
  /** 审批动作：approve=通过，reject=驳回 */
  action: 'approve' | 'reject'
  loading: boolean
  error?: string
  onConfirm: (comment: string) => void
  onCancel: () => void
}

const ACTION_CONFIG = {
  approve: { title: '通过审批', confirmLabel: '确认通过', confirmClass: 'bg-green-600 hover:bg-green-700 active:bg-green-800' },
  reject: { title: '驳回申请', confirmLabel: '确认驳回', confirmClass: 'bg-red-600 hover:bg-red-700 active:bg-red-800' },
}

export default function ReviewDialog({ open, action, loading, error, onConfirm, onCancel }: ReviewDialogProps) {
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open) setComment('')
  }, [open])

  if (!open) return null

  const config = ACTION_CONFIG[action]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-neutral-900">{config.title}</h2>
        <label className="mt-3 block text-sm text-neutral-600">
          审批意见（选填）
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="可填写审批意见，最多 500 字符"
            className="mt-1 block w-full resize-none rounded-lg border border-neutral-300 p-2.5 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <p className="mt-1 text-right text-xs text-neutral-400">{comment.length}/500</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-neutral-300 bg-white py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(comment)}
            disabled={loading}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50 ${config.confirmClass}`}
          >
            {loading ? '处理中…' : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
