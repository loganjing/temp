import { useState } from 'react';
import { Send } from 'lucide-react';
import { apiErrorMessage, replyTicket } from '../api/client';
import type { Reply, TicketDetail } from '../api/types';
import { useCurrentUser } from '../app/currentUser';
import { useToast } from '../app/toast';

interface ReplyBoxProps {
  detail: TicketDetail;
  onReplied: (ticket: TicketDetail) => void;
}

/** 回复输入框：多轮回复（AC-02）。角色合法性由服务端校验（提交人或当前处理人）。 */
export function ReplyBox({ detail, onReplied }: ReplyBoxProps) {
  const { currentUser } = useCurrentUser();
  const { pushToast } = useToast();
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const text = content.trim();
    if (text.length === 0) {
      setError('回复内容不能为空');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result: { reply: Reply; ticket: TicketDetail } = await replyTicket(detail.id, {
        content: text,
      });
      setContent('');
      pushToast('success', '回复已发送');
      onReplied(result.ticket);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reply-form">
      <div className="reply-form-meta">
        以 <strong>{currentUser !== null ? currentUser.name : '当前用户'}</strong> 回复
      </div>
      <textarea
        className="textarea"
        rows={3}
        placeholder="输入回复内容…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={busy}
        aria-label="回复内容"
      />
      {error !== null && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="reply-form-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void submit()}
          disabled={busy || content.trim().length === 0}
        >
          <Send size={13} />
          {busy ? '发送中…' : '发送回复'}
        </button>
      </div>
    </div>
  );
}
