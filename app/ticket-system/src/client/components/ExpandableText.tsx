import { useState } from 'react'

/**
 * 长文本展示：超过 limit 时截断并提供展开/收起；title 提供悬停查看全文。
 */
export function ExpandableText({
  text,
  limit = 200,
  className = '',
}: {
  text: string
  limit?: number
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const overflow = text.length > limit
  const shown = expanded || !overflow ? text : `${text.slice(0, limit)}…`
  return (
    <div className={className}>
      <p className="whitespace-pre-wrap break-words" title={text}>
        {shown}
      </p>
      {overflow && (
        <button type="button" className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-500" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  )
}
