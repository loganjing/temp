import { useState } from 'react';
import { Star } from 'lucide-react';
import { apiErrorMessage, rateTicket } from '../api/client';
import type { TicketDetail } from '../api/types';
import { useCurrentUser } from '../app/currentUser';
import { useToast } from '../app/toast';
import { formatDateTime } from '../app/format';

function Stars({ score }: { score: number }) {
  return (
    <span className="stars" aria-label={`满意度 ${score} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={16} className={n <= score ? 'star-filled' : 'star-empty'} aria-hidden />
      ))}
      <span className="rating-score">{score} / 5</span>
    </span>
  );
}

interface RatingPanelProps {
  detail: TicketDetail;
  onRated: () => void;
}

/**
 * 满意度评价（AC-09）：完成后由提交人提交 1–5 分；结果读回展示。
 * 角色与“每工单一次”由服务端校验；前端仅按已知提交人身份控制表单呈现。
 */
export function RatingPanel({ detail, onRated }: RatingPanelProps) {
  const { currentUser } = useCurrentUser();
  const { pushToast } = useToast();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail.rating !== null) {
    return (
      <div className="rating-result">
        <Stars score={detail.rating.score} />
        {detail.rating.comment !== null && detail.rating.comment.length > 0 && (
          <p className="rating-comment">“{detail.rating.comment}”</p>
        )}
        <span className="muted small">评价时间：{formatDateTime(detail.rating.createdAt)}</span>
      </div>
    );
  }

  if (detail.status !== 'completed') {
    return <p className="muted small">工单完成后可由提交人进行满意度评价。</p>;
  }

  const isSubmitter = currentUser !== null && currentUser.id === detail.submitter.id;
  if (!isSubmitter) {
    return <p className="muted small">工单已完成，等待提交人评价。</p>;
  }

  const submit = async () => {
    if (score === null) {
      setError('请先选择满意度评分（1–5）');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trimmed = comment.trim();
      await rateTicket(detail.id, trimmed.length > 0 ? { score, comment: trimmed } : { score });
      pushToast('success', '满意度评价已提交');
      onRated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rating-form">
      <div className="star-picker" role="radiogroup" aria-label="满意度评分">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            className={`star-btn${score !== null && n <= score ? ' active' : ''}`}
            onClick={() => setScore(n)}
            disabled={busy}
            title={`${n} 分`}
          >
            <Star size={18} className={score !== null && n <= score ? 'star-filled' : 'star-empty'} aria-hidden />
            <span className="star-btn-score">{n}</span>
          </button>
        ))}
      </div>
      <textarea
        className="textarea"
        rows={2}
        placeholder="评价评语（可选）"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={busy}
        aria-label="评价评语"
      />
      {error !== null && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void submit()}
          disabled={busy || score === null}
        >
          {busy ? '提交中…' : '提交评价'}
        </button>
      </div>
    </div>
  );
}
