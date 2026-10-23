import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { TopBar } from '../components/Layout/TopBar';
import { FilterBar, type FilterConfig } from '../components/Filter/FilterBar';
import { DataTable, type Column } from '../components/Table/DataTable';
import { FormModal, type FormField } from '../components/Modal/FormModal';
import { useToast } from '../client/context/ToastContext';
import {
  fetchAssessments,
  createAssessment,
} from '../client/api/assessments';
import { fetchPlots as fetchPlotsApi } from '../client/api/plots';
import type { Assessment, Plot, MaturityLevel } from '../client/types';
import { MATURITY_LEVELS } from '../client/types';

export function MaturityPage() {
  const toast = useToast();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAssessments({
        plotCode: filterValues.plotCode || undefined,
        maturityLevel: (filterValues.maturityLevel as MaturityLevel) || undefined,
        harvestable:
          filterValues.harvestable === '' ? undefined :
          filterValues.harvestable === 'true',
      });
      setAssessments(res.items);
    } catch (err) {
      toast.error('加载评估记录失败');
    } finally {
      setLoading(false);
    }
  }, [filterValues, toast]);

  const loadPlots = useCallback(async () => {
    try {
      const res = await fetchPlotsApi();
      setPlots(res.items);
    } catch {
      toast.error('加载地块列表失败');
    }
  }, [toast]);

  useEffect(() => {
    loadAssessments();
    loadPlots();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filterConfigs: FilterConfig[] = [
    { name: 'plotCode', label: '地块编号', type: 'text', placeholder: '输入地块编号' },
    {
      name: 'maturityLevel',
      label: '成熟度等级',
      type: 'select',
      options: MATURITY_LEVELS.map((l) => ({ value: l, label: l })),
    },
    {
      name: 'harvestable',
      label: '可采摘状态',
      type: 'select',
      options: [
        { value: 'true', label: '可采摘' },
        { value: 'false', label: '不可采摘' },
      ],
    },
  ];

  const columns: Column<Assessment>[] = [
    {
      key: 'plotCode',
      header: '地块编号',
      render: (row) => <span className="cell-strong">{row.plotCode}</span>,
    },
    { key: 'plotName', header: '地块名称', render: (row) => row.plotName },
    { key: 'variety', header: '品种', render: (row) => row.variety },
    {
      key: 'maturityLevel',
      header: '成熟度等级',
      render: (row) => <MaturityBadge level={row.maturityLevel} />,
    },
    {
      key: 'harvestable',
      header: '可采摘',
      render: (row) => {
        const plot = plots.find((p) => p.id === row.plotId);
        return plot?.harvestable ? (
          <span className="badge badge--success">可采摘</span>
        ) : (
          <span className="badge badge--default">不可采摘</span>
        );
      },
    },
    {
      key: 'assessmentTime',
      header: '评估时间',
      render: (row) => formatDateTime(row.assessmentTime),
    },
    { key: 'assessor', header: '评估人', render: (row) => row.assessor },
    {
      key: 'notes',
      header: '备注',
      render: (row) => row.notes || <span className="cell-muted">—</span>,
    },
  ];

  const formFields: FormField[] = [
    {
      name: 'plotId',
      label: '关联地块',
      type: 'select',
      required: true,
      options: plots.map((p) => ({
        value: p.id,
        label: `${p.code} - ${p.name} (${p.variety})`,
      })),
    },
    {
      name: 'maturityLevel',
      label: '成熟度等级',
      type: 'select',
      required: true,
      options: MATURITY_LEVELS.map((l) => ({ value: l, label: l })),
    },
    {
      name: 'assessmentTime',
      label: '评估时间',
      type: 'datetime-local',
      required: true,
      defaultValue: toDatetimeLocal(new Date()),
    },
    {
      name: 'assessor',
      label: '评估人',
      type: 'text',
      required: true,
      placeholder: '输入评估人姓名',
    },
    {
      name: 'notes',
      label: '备注',
      type: 'textarea',
      placeholder: '输入备注信息（可选）',
    },
  ];

  async function handleSubmit(values: Record<string, string>) {
    try {
      const assessment = await createAssessment({
        plotId: values.plotId,
        maturityLevel: values.maturityLevel as MaturityLevel,
        assessmentTime: new Date(values.assessmentTime).toISOString(),
        assessor: values.assessor,
        notes: values.notes || undefined,
      });
      toast.success('评估记录创建成功');
      setShowForm(false);
      await loadAssessments();
      await loadPlots();
      void assessment;
    } catch (err) {
      toast.error('创建评估记录失败，请重试');
      throw err;
    }
  }

  return (
    <div className="page">
      <TopBar title="成熟度识别" />
      <div className="page__body">
        <FilterBar
          filters={filterConfigs}
          values={filterValues}
          onChange={(name, value) => setFilterValues((prev) => ({ ...prev, [name]: value }))}
          onSearch={loadAssessments}
          onReset={() => {
            setFilterValues({});
            loadAssessments();
          }}
          extra={
            <button className="btn btn--primary" onClick={() => setShowForm(true)}>
              <Plus size={18} />
              <span>新建评估</span>
            </button>
          }
        />
        <div className="card">
          <DataTable
            columns={columns}
            data={assessments}
            loading={loading}
            emptyText="暂无成熟度评估记录，点击「新建评估」创建第一条记录"
          />
        </div>
      </div>
      <FormModal
        open={showForm}
        title="新建成熟度评估"
        fields={formFields}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
        submitLabel="创建评估"
      />
    </div>
  );
}

function MaturityBadge({ level }: { level: MaturityLevel }) {
  const cls =
    level === '成熟' || level === '过熟'
      ? 'badge badge--success'
      : level === '接近成熟'
        ? 'badge badge--warning'
        : 'badge badge--default';
  return <span className={cls}>{level}</span>;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function toDatetimeLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// 重导出供其他页面复用
export { formatDateTime, toDatetimeLocal };
