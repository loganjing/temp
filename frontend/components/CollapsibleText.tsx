import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** 长文本（描述、回复）展开 / 收起。 */
export function CollapsibleText({
  text,
  limit = 160,
}: {
  text: string;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > limit;
  const shown = expanded || !isLong ? text : `${text.slice(0, limit)}…`;
  return (
    <div className="collapsible-text">
      <p className="text-prewrap">{shown}</p>
      {isLong && (
        <button
          type="button"
          className="link-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp size={13} /> 收起
            </>
          ) : (
            <>
              <ChevronDown size={13} /> 展开全文
            </>
          )}
        </button>
      )}
    </div>
  );
}
