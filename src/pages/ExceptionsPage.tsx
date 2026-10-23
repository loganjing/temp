import { useState, useEffect, useCallback } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { TopBar } from '../components/Layout/TopBar';
import { FilterBar, type FilterConfig } from '../components/Filter/FilterBar';
import { DataTable, type Column } from '../components/Table/DataTable';
import { FormModal, type FormField } from '../components/Modal/FormModal';
import { Modal } from '../components/Modal/Modal';
import { useToast } from '../client/context/ToastContext';
import { fetchExceptions, createException, updateException } from '../client/api/exceptions';
import { fetchTasks } from '../client/api/tasks';
import { formatDateTime } from './MaturityPage';
import type {
  ExceptionReport,
  ExceptionStatus,
  ExceptionType,
  PickingTask,
} from '../client/types';
import { EXCEPTION_TYPES, EXCEPTION_STATUSES } from '../client/types';

export function ExceptionsPage() {
  const toast = useToast();
  const [exceptions, setExceptions] = useState<ExceptionReport[]>([]);
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [statusUpdateTarget, setStatusUpdateTarget] = useState<ExceptionReport | null>(null);

  const loadExceptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchExceptions({
        status: (filterValues.status as ExceptionStatus) || undefined,
        exceptionType: (filterValues.exceptionType as ExceptionType) || undefined,
        taskId: filterValues.taskId || undefined,
      });
      setExceptions(res.items);
    } catch {
      toast.error('加载异常列表失败');
    } finally {
      setLoading(false);
    }
  }, [filterValues, toast]);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetchTasks();
      setTasks(res.items);
    } catch {
      // 非关键加载
    }
  }, []);

  useEffect(() => {
    loadExceptions();
    loadTasks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filterConfigs: FilterConfig[] = [
    {
      name: 'status',
      label: '处理状态',
      type: 'select',
      options: EXCEPTION_STATUSES.map((s) => ({ value: s, label: s })),
    },
    {
      name: 'exceptionType',
      label: '异常类型',
      type: 'select',
      options: EXCEPTION_TYPES.map((t) => ({ value: t, label: t })),
    },
  ];

  const columns: Column<ExceptionReport>[] = [
    {
      key: 'exceptionType',
      header: '异常类型',
      render: (row) => <ExceptionTypeBadge type={row.exceptionType} />,
    },
    {
      key: 'taskNo',
      header: '关联任务',
      render: (row) =>
        row.taskNo ? (
          <span className="cell-strong">{row.taskNo}</span>
        ) : (
          <span className="cell-muted">—</span>
        ),
    },
    { key: 'description', header: '描述', render: (row) => row.description },
    { key: 'reporter', header: '上报人', render: (row) => row.reporter },
    {
      key: 'reportTime',
      header: '上报时间',
      render: (row) => formatDateTime(row.reportTime),
    },
    {
      key: 'status',
      header: '状态',
      render: (row) => <ExceptionStatusBadge status={row.status} />,
    },
    {
      key: 'resolutionNotes',
      header: '处理说明',
      render: (row) =>
        row.resolutionNotes ? row.resolutionNotes : <span className="cell-muted">—</span>,
    },
    {
      key: 'actions',
      header: '操作',
      render: (row) =>
        row.status !== '已解决' ? (
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setStatusUpdateTarget(row)}
          >
            更新状态
          </button>
        ) : (
          <span className="cell-muted">已关闭</span>
        ),
    },
  ];

  const formFields: FormField[] = [
    {
      name: 'taskId',
      label: '关联任务（可选）',
      type: 'select',
      options: tasks.map((t) => ({
        value: t.id,
        label: `${t.taskNo} - ${t.plotName}`,
      })),
    },
    {
      name: 'exceptionType',
      label: '异常类型',
      type: 'select',
      required: true,
      options: EXCEPTION_TYPES.map((t) => ({ value: t, label: t })),
    },
    {
      name: 'description',
      label: '异常描述',
      type: 'textarea',
      required: true,
      placeholder: '请描述异常详情',
    },
    {
      name: 'reporter',
      label: '上报人',
      type: 'text',
      required: true,
      placeholder: '输入上报人姓名',
    },
    {
      name: 'reportTime',
      label: '上报时间',
      type: 'datetime-local',
      required: true,
      defaultValue: toDatetimeLocalNow(),
    },
  ];

  async function handleSubmit(values: Record<string, string>) {
    try {
      await createException({
        taskId: values.taskId || undefined,
        exceptionType: values.exceptionType as ExceptionType,
        description: values.description,
        reporter: values.reporter,
        reportTime: new Date(values.reportTime).toISOString(),
      });
      toast.success('异常报告提交成功');
      setShowForm(false);
      await loadExceptions();
    } catch (err) {
      toast.error('提交异常报告失败，请重试');
      throw err;
    }
  }

  async function handleStatusUpdate(
    target: ExceptionReport,
    status: ExceptionStatus,
    resolutionNotes: string,
  ) {
    try {
      await updateException(target.id, {
        status,
        resolutionNotes: resolutionNotes || undefined,
      });
      toast.success(`异常状态已更新为「${status}」`);
      setStatusUpdateTarget(null);
      await loadExceptions();
    } catch {
      toast.error('更新异常状态失败');
    }
  }

  return (
    <div className="page">
      <TopBar title="异常上报" />
      <div className="page__body">
        <FilterBar
          filters={filterConfigs}
          values={filterValues}
          onChange={(name, value) => setFilterValues((prev) => ({ ...prev, [name]: value }))}
          onSearch={loadExceptions}
          onReset={() => {
            setFilterValues({});
            loadExceptions();
          }}
          extra={
            <button className="btn btn--primary" onClick={() => setShowForm(true)}>
              <Plus size={18} />
              <span>上报异常</span>
            </button>
          }
        />
        <div className="card">
          <DataTable
            columns={columns}
            data={exceptions}
            loading={loading}
            emptyText="暂无异常报告，点击「上报异常」提交新报告"
          />
        </div>
      </div>
      <FormModal
        open={showForm}
        title="上报异常"
        fields={formFields}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
        submitLabel="提交报告"
      />
      {statusUpdateTarget && (
        <StatusUpdateModal
          target={statusUpdateTarget}
          onClose={() => setStatusUpdateTarget(null)}
          onSubmit={handleStatusUpdate}
        />
      )}
    </div>
  );
}

function StatusUpdateModal({
  target,
  onClose,
  onSubmit,
}: {
  target: ExceptionReport;
  onClose: () => void;
  onSubmit: (target: ExceptionReport, status: ExceptionStatus, notes: string) => void;
}) {
  const allowedStatuses: ExceptionStatus[] =
    target.status === '待处理' ? ['处理中', '已解决'] : ['已解决'];

  const [status, setStatus] = useState<ExceptionStatus>(allowedStatuses[0]);
  const [notes, setNotes] = useState('');

  return (
    <Modal
      open={true}
      title="更新异常处理状态"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--primary" onClick={() => onSubmit(target, status, notes)}>
            确认更新
          </button>
        </>
      }
    >
      <div className="form">
        <div className="form__field">
          <label className="form__label">当前状态</label>
          <div className="form__static">
            <ExceptionStatusBadge status={target.status} />
          </div>
        </div>
        <div className="form__field">
          <label className="form__label">
            目标状态<span className="form__required">*</span>
          </label>
          <select
            className="form__input"
            value={status}
            onChange={(e) => setStatus(e.target.value as ExceptionStatus)}
          >
            {allowedStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="form__field">
          <label className="form__label">处理说明</label>
          <textarea
            className="form__input form__textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="输入处理说明（可选）"
            rows={3}
          />
        </div>
      </div>
    </Modal>
  );
}

function ExceptionTypeBadge({ type }: { type: ExceptionType }) {
  return (
    <span className="badge badge--info">
      <AlertTriangle size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
      {type}
    </span>
  );
}

function ExceptionStatusBadge({ status }: { status: ExceptionStatus }) {
  const cls =
    status === '已解决'
      ? 'badge badge--success'
      : status === '处理中'
        ? 'badge badge--info'
        : 'badge badge--danger';
  return <span className={cls}>{status}</span>;
}

function toDatetimeLocalNow(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
