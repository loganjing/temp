import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  ErrorBlock,
  NavBar,
  Skeleton,
  Toast,
} from 'antd-mobile';
import {
  ApiError,
  fetchVisitorById,
  updateVisitorStatus,
  type ApprovalTargetStatus,
  type Visitor,
} from '../api/client';
import { formatDateTime, statusLabel } from '../utils/format';

type LoadState = 'loading' | 'error' | 'success';

export default function VisitorDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState<ApprovalTargetStatus | null>(
    null,
  );
  const [inlineError, setInlineError] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    setErrorMsg('');
    try {
      const v = await fetchVisitorById(id);
      setVisitor(v);
      setState('success');
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : '加载访客详情失败，请稍后重试';
      setErrorMsg(msg);
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      setErrorMsg('缺少访客 ID');
      setState('error');
      return;
    }
    void load();
  }, [id, load]);

  const handleApprove = useCallback(
    async (target: ApprovalTargetStatus) => {
      if (!visitor || submitting) return;
      setSubmitting(target);
      setInlineError('');
      try {
        const updated = await updateVisitorStatus(visitor.id, target);
        setVisitor(updated);
        Toast.show({
          content: target === 'approved' ? '已通过' : '已拒绝',
          icon: 'success',
        });
        // 审批成功后返回列表
        navigate('/', { replace: true });
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.message : '审批操作失败，请稍后重试';
        setInlineError(msg);
      } finally {
        setSubmitting(null);
      }
    },
    [visitor, submitting, navigate],
  );

  const renderRows = (v: Visitor) => {
    const rows: Array<{ label: string; value: string }> = [
      { label: '姓名', value: v.name },
      { label: '公司', value: v.company },
      { label: '手机号', value: v.phone },
      { label: '身份证号', value: v.id_card },
      { label: '访问事由', value: v.visit_reason },
      { label: '被访人', value: v.host_name ?? '—' },
      {
        label: '预计到访',
        value: formatDateTime(v.expected_arrival_time),
      },
      { label: '手机号来源', value: v.phone_source === 'wechat' ? '微信获取' : '手工填写' },
      { label: '审核状态', value: statusLabel(v.status) },
      { label: '提交时间', value: formatDateTime(v.created_at) },
      { label: '更新时间', value: formatDateTime(v.updated_at) },
    ];
    return rows.map((r) => (
      <div className="detail-row" key={r.label}>
        <div className="detail-label">{r.label}</div>
        <div className="detail-value">{r.value}</div>
      </div>
    ));
  };

  const canApprove = visitor?.status === 'pending';

  return (
    <>
      <NavBar onBack={() => navigate(-1)}>访客详情</NavBar>
      <main className="app-content">
        {state === 'loading' && (
          <div style={{ padding: 16 }}>
            <Skeleton animated style={{ height: 320 }} />
          </div>
        )}

        {state === 'error' && (
          <div className="page-error" role="alert">
            <ErrorBlock
              status="empty"
              title="加载失败"
              description={errorMsg}
            />
            <a
              className="adm-button adm-button-fill-outline adm-button-size-middle"
              onClick={() => void load()}
              role="button"
            >
              重试
            </a>
          </div>
        )}

        {state === 'success' && visitor && (
          <>
            <div className="detail-section">{renderRows(visitor)}</div>
            {inlineError && (
              <div className="inline-error" role="alert">
                {inlineError}
              </div>
            )}
          </>
        )}
      </main>

      {state === 'success' && visitor && canApprove && (
        <div className="action-bar">
          <Button
            color="danger"
            fill="outline"
            loading={submitting === 'rejected'}
            disabled={submitting !== null}
            onClick={() => void handleApprove('rejected')}
            block
          >
            拒绝
          </Button>
          <Button
            color="primary"
            loading={submitting === 'approved'}
            disabled={submitting !== null}
            onClick={() => void handleApprove('approved')}
            block
          >
            通过
          </Button>
        </div>
      )}
    </>
  );
}
