import { useState } from 'react';
import { reportsApi } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function QualityReportPage({ areas }) {
  const [areaId, setAreaId] = useState('');
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showError } = useToast();

  async function handleGenerate() {
    if (!from || !to) {
      setError('请选择起始和结束日期');
      return;
    }
    if (from > to) {
      setError('起始日期不能晚于结束日期');
      return;
    }
    setError('');
    setLoading(true);
    setReport(null);
    try {
      const query = { from, to };
      if (areaId) query.area_id = areaId;
      const data = await reportsApi.quality(query);
      setReport(data);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function formatPercent(val) {
    if (val === null || val === undefined) return '—';
    return `${(val * 100).toFixed(1)}%`;
  }

  return (
    <div>
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">区域筛选</label>
          <select className="form-select" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">全部区域</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">起始日期</label>
          <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">结束日期</label>
          <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="form-group">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '生成报告'}
          </button>
        </div>
      </div>
      {error && <div className="form-error mb-16">{error}</div>}

      {loading && (
        <div className="skeleton">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" />)}
        </div>
      )}

      {!loading && !report && (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-text">选择筛选条件后点击"生成报告"查看质量报告</div>
        </div>
      )}

      {!loading && report && (
        <div>
          <div className="section-title">
            质量报告 — {report.area_name || '全部区域'}（{report.from} ~ {report.to}）
          </div>
          <div className="report-grid">
            <div className="report-stat">
              <div className="report-stat-label">任务实例总数</div>
              <div className="report-stat-value">{report.total_task_instances}</div>
            </div>
            <div className="report-stat">
              <div className="report-stat-label">已完成实例数</div>
              <div className="report-stat-value">{report.completed_task_instances}</div>
            </div>
            <div className="report-stat">
              <div className="report-stat-label">作业完成率</div>
              <div className="report-stat-value success">{formatPercent(report.task_completion_rate)}</div>
            </div>
            <div className="report-stat">
              <div className="report-stat-label">障碍上报总数</div>
              <div className="report-stat-value">{report.obstacle_count}</div>
            </div>
            <div className="report-stat">
              <div className="report-stat-label">已处理障碍数</div>
              <div className="report-stat-value">{report.obstacle_resolved_count}</div>
            </div>
            <div className="report-stat">
              <div className="report-stat-label">障碍处理率</div>
              <div className="report-stat-value warning">{formatPercent(report.obstacle_resolution_rate)}</div>
            </div>
          </div>

          <div className="section-title mt-24">耗材消耗汇总</div>
          {!report.supply_consumption || report.supply_consumption.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">该时间段内无耗材消耗记录</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>耗材名称</th><th>消耗量</th></tr>
              </thead>
              <tbody>
                {report.supply_consumption.map((s) => (
                  <tr key={s.supply_item_id}>
                    <td>{s.supply_item_name}</td>
                    <td>{s.consumed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
