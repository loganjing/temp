import { useCallback, useEffect, useState } from 'react';
import type { Location, MapEdge, TopologyResponse } from '@/api/types';
import * as locationApi from '@/api/locations';
import { LoadingSkeleton, EmptyState, ErrorState } from '@/components/common/Feedback';
import { locationTypeLabel } from '@/components/common/labels';
import { formatApiError } from '@/api/client';

type Tab = 'locations' | 'topology';

export function MapConfigPage() {
  const [tab, setTab] = useState<Tab>('locations');
  const [locations, setLocations] = useState<Location[]>([]);
  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'locations') {
        const res = await locationApi.fetchLocations();
        setLocations(res.locations);
      } else {
        const res = await locationApi.fetchTopology();
        setTopology(res);
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page__toolbar">
        <div className="period-tabs">
          <button className={`period-tab${tab === 'locations' ? ' period-tab--active' : ''}`} onClick={() => setTab('locations')}>
            库位列表
          </button>
          <button className={`period-tab${tab === 'topology' ? ' period-tab--active' : ''}`} onClick={() => setTab('topology')}>
            通道拓扑
          </button>
        </div>
        <button className="btn btn--sm" onClick={load}>刷新</button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'locations' ? (
        locations.length === 0 ? (
          <EmptyState message="暂无库位数据" />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>库位编码</th>
                  <th>名称</th>
                  <th>X 坐标</th>
                  <th>Y 坐标</th>
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.locationCode}>
                    <td className="mono">{l.locationCode}</td>
                    <td>{l.name}</td>
                    <td>{l.x.toFixed(1)}</td>
                    <td>{l.y.toFixed(1)}</td>
                    <td>
                      <span className={`status-badge ${l.type === 'storage' ? 'status--completed' : 'status--assigned'}`}>
                        {locationTypeLabel(l.type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <TopologyView topology={topology} />
      )}
    </div>
  );
}

function TopologyView({ topology }: { topology: TopologyResponse | null }) {
  if (!topology) return <EmptyState message="暂无拓扑数据" />;

  return (
    <div className="topology-view">
      <div className="topology-stats">
        <span>节点数: {topology.nodes.length}</span>
        <span>通道数: {topology.edges.length}</span>
      </div>

      {/* SVG topology graph */}
      <div className="topology-graph-wrapper">
        <TopologySvg nodes={topology.nodes} edges={topology.edges} />
      </div>

      <div className="detail-section">
        <h3 className="detail-section__title">通道列表</h3>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>起点</th>
                <th>终点</th>
                <th>距离</th>
                <th>方向</th>
              </tr>
            </thead>
            <tbody>
              {topology.edges.map((e: MapEdge, i: number) => (
                <tr key={i}>
                  <td className="mono">{e.fromLocationCode}</td>
                  <td className="mono">{e.toLocationCode}</td>
                  <td>{e.distance.toFixed(1)}</td>
                  <td>{e.direction === 'bidirectional' ? '双向' : '单向'}</td>
                </tr>
              ))}
              {topology.edges.length === 0 && (
                <tr><td colSpan={4} className="empty-text">暂无通道数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TopologySvg({ nodes, edges }: { nodes: Location[]; edges: MapEdge[] }) {
  if (nodes.length === 0) return <EmptyState message="暂无节点" />;

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padding = 40;
  const width = Math.max(600, maxX - minX + padding * 2);
  const height = Math.max(400, maxY - minY + padding * 2);

  const nodeMap = new Map(nodes.map((n) => [n.locationCode, n]));

  function transform(x: number, y: number) {
    return { tx: x - minX + padding, ty: y - minY + padding };
  }

  return (
    <svg className="topology-svg" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%', height: 'auto' }}>
      {/* edges */}
      {edges.map((e, i) => {
        const from = nodeMap.get(e.fromLocationCode);
        const to = nodeMap.get(e.toLocationCode);
        if (!from || !to) return null;
        const f = transform(from.x, from.y);
        const t = transform(to.x, to.y);
        return (
          <g key={i}>
            <line
              x1={f.tx} y1={f.ty} x2={t.tx} y2={t.ty}
              stroke="#a0aec0" strokeWidth="2"
              strokeDasharray={e.direction === 'unidirectional' ? '6 4' : undefined}
            />
            {e.direction === 'bidirectional' && (
              <line x1={t.tx} y1={t.ty} x2={f.tx} y2={f.ty} stroke="#a0aec0" strokeWidth="2" />
            )}
          </g>
        );
      })}

      {/* nodes */}
      {nodes.map((n) => {
        const { tx, ty } = transform(n.x, n.y);
        const isTransit = n.type === 'transit';
        return (
          <g key={n.locationCode}>
            <circle
              cx={tx} cy={ty} r="14"
              fill={isTransit ? '#fef3c7' : '#dbeafe'}
              stroke={isTransit ? '#f59e0b' : '#3b82f6'}
              strokeWidth="2"
            />
            <text x={tx} y={ty + 28} textAnchor="middle" fontSize="11" fill="#4a5568">
              {n.locationCode}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
