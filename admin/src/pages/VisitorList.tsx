import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  ErrorBlock,
  PullToRefresh,
  Skeleton,
  Toast,
} from 'antd-mobile';
import {
  ApiError,
  fetchPendingVisitors,
  type Visitor,
} from '../api/client';
import { formatDateTime } from '../utils/format';

type LoadState = 'loading' | 'error' | 'success';

export default function VisitorList() {
  const navigate = useNavigate();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const load = useCallback(async () => {
    setState((prev) => (prev === 'success' ? prev : 'loading'));
    try {
      const res = await fetchPendingVisitors();
      setVisitors(res.data ?? []);
      setState('success');
      setErrorMsg('');
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : '加载待审核列表失败，请稍后重试';
      setErrorMsg(msg);
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 下拉刷新：PullToRefresh 通过 onRefresh 返回的 Promise 自管理刷新态
  const handleRefresh = useCallback(async () => {
    try {
      const res = await fetchPendingVisitors();
      setVisitors(res.data ?? []);
      setErrorMsg('');
      setState('success');
      Toast.show({ content: '已刷新', icon: 'success' });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : '刷新失败，请稍后重试';
      setErrorMsg(msg);
      Toast.show({ content: msg, icon: 'fail' });
    }
  }, []);

  // 加载中：骨架屏
  if (state === 'loading') {
    return (
      <div className="visitor-list" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            animated
            className="visitor-card"
            style={{ height: 110, borderRadius: 10 }}
          />
        ))}
      </div>
    );
  }

  // 页面级错误 + 重试
  if (state === 'error') {
    return (
      <div className="page-error" role="alert">
        <ErrorBlock
          status="empty"
          title="加载失败"
          description={errorMsg}
        />
        <Button
          color="primary"
          fill="outline"
          size="middle"
          onClick={() => void load()}
        >
          重试
        </Button>
      </div>
    );
  }

  // 空态文案
  if (visitors.length === 0) {
    return (
      <div className="empty-state">
        <ErrorBlock status="empty" title="暂无待审核访客" />
        <Button
          color="primary"
          fill="outline"
          size="middle"
          onClick={() => void handleRefresh()}
        >
          刷新
        </Button>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="visitor-list">
        {visitors.map((v) => (
          <Card
            key={v.id}
            className="visitor-card"
            onClick={() => navigate(`/visitors/${v.id}`)}
            title={
              <div className="visitor-card-name">
                <span>{v.name}</span>
              </div>
            }
          >
            <div className="visitor-card-meta">{v.company}</div>
            <div className="visitor-card-reason">{v.visit_reason}</div>
            <div className="visitor-card-time">
              提交时间：{formatDateTime(v.created_at)}
            </div>
          </Card>
        ))}
      </div>
    </PullToRefresh>
  );
}
