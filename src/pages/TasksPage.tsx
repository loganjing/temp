import { useState, useEffect, useCallback } from 'react';
import { Plus, Play, CheckCircle, XCircle } from 'lucide-react';
import { TopBar } from '../components/Layout/TopBar';
import { FilterBar, type FilterConfig } from '../components/Filter/FilterBar';
import { DataTable, type Column } from '../components/Table/DataTable';
import { FormModal, type FormField } from '../components/Modal/FormModal';
import { useToast } from '../client/context/ToastContext';
import { fetchTasks, createTask, updateTaskStatus } from '../client/api/tasks';
import { fetchPlots } from '../client/api/plots';
import { formatDateTime } from './MaturityPage';
import type { PickingTask, Plot, TaskStatus, TaskPriority } from '../client/types';
import { TASK_STATUSES, TASK_PRIORITIES } from '../client/types';

export function TasksPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTasks({
        status: (filterValues.status as TaskStatus) || undefined,
        plotId: filterValues.plotId || undefined,
        assignedWorker: filterValues.assignedWorker || undefined,
        plannedDate: filterValues.plannedDate || undefined,
      });
      setTasks(res.items);
    } catch {
      toast.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [filterValues, toast]);

  const loadPlots = useCallback(async () => {
    try {
      const res = await fetchPlots({ harvestable: true });
      setPlots(res.items);
    } catch {
      toast.error('加载可采摘地块失败');
    }
  }, [toast]);

  useEffect(() => {
    loadTasks();
    loadPlots();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filterConfigs: FilterConfig[] = [
    {
      name: 'status',
      label: '任务状态',
      type: 'select',
      options: TASK_STATUSES.map((s) => ({ value: s, label: s })),
    },
    {
      name: 'plotId',
      label: '地块',
      type: 'select',
      options: plots.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
    },
    { name: 'assignedWorker', label: '作业人员', type: 'text', placeholder: '输入作业人员' },
    { name: 'plannedDate', label: '计划日期', type: 'date' },
  ];

  const columns: Column<PickingTask>[] = [
    {
      key: 'taskNo',
      header: '任务编号',
      render: (row) => <span className="cell-strong">{row.taskNo}</span>,
    },
    { key: 'plotCode', header: '地块', render: (row) => `${row.plotCode} ${row.plotName}` },
    { key: 'variety', header: '品种', render: (row) => row.variety },
    {
      key: 'plannedQuantity',
      header: '计划量(kg)',
      align: 'right',
      render: (row) => String(row.plannedQuantity),
    },
    {
      key: 'totalPickedQuantity',
      header: '已采量(kg)',
      align: 'right',
      render: (row) => (
        <span className={row.totalPickedQuantity > 0 ? 'cell-strong' : 'cell-muted'}>
          {row.totalPickedQuantity}
        </span>
      ),
    },
    { key: 'assignedWorker', header: '作业人员', render: (row) => row.assignedWorker },
    { key: 'plannedDate', header: '计划日期', render: (row) => row.plannedDate },
    {
      key: 'priority',
      header: '优先级',
      render: (row) =>
        row.priority === '紧急' ? (
          <span className="badge badge--danger">紧急</span>
        ) : (
          <span className="badge badge--default">普通</span>
        ),
    },
    {
      key: 'status',
      header: '状态',
      render: (row) => <TaskStatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '操作',
      render: (row) => <TaskActions task={row} onAction={handleStatusChange} />,
    },
  ];

  const formFields: FormField[] = [
    {
      name: 'plotId',
      label: '可采摘地块',
      type: 'select',
      required: true,
      options: plots.map((p) => ({
        value: p.id,
        label: `${p.code} - ${p.name} (${p.variety})`,
      })),
    },
    {
      name: 'plannedQuantity',
      label: '计划采摘量(kg)',
      type: 'number',
      required: true,
      min: 0,
      placeholder: '输入计划采摘量',
    },
    {
      name: 'assignedWorker',
      label: '作业人员',
      type: 'text',
      required: true,
      placeholder: '输入作业人员姓名',
    },
    {
      name: 'plannedDate',
      label: '计划采摘日期',
      type: 'date',
      required: true,
    },
    {
      name: 'priority',
      label: '优先级',
      type: 'select',
      required: true,
      options: TASK_PRIORITIES.map((p) => ({ value: p, label: p })),
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
      await createTask({
        plotId: values.plotId,
        plannedQuantity: Number(values.plannedQuantity),
        assignedWorker: values.assignedWorker,
        plannedDate: values.plannedDate,
        priority: values.priority as TaskPriority,
        notes: values.notes || undefined,
      });
      toast.success('任务创建成功');
      setShowForm(false);
      await loadTasks();
    } catch (err) {
      toast.error('创建任务失败，请重试');
      throw err;
    }
  }

  async function handleStatusChange(task: PickingTask, targetStatus: TaskStatus) {
    try {
      await updateTaskStatus(task.id, { status: targetStatus });
      toast.success(`任务状态已更新为「${targetStatus}」`);
      await loadTasks();
    } catch {
      toast.error('更新任务状态失败');
    }
  }

  return (
    <div className="page">
      <TopBar title="采摘任务规划" />
      <div className="page__body">
        <FilterBar
          filters={filterConfigs}
          values={filterValues}
          onChange={(name, value) => setFilterValues((prev) => ({ ...prev, [name]: value }))}
          onSearch={loadTasks}
          onReset={() => {
            setFilterValues({});
            loadTasks();
          }}
          extra={
            <button className="btn btn--primary" onClick={() => setShowForm(true)}>
              <Plus size={18} />
              <span>创建任务</span>
            </button>
          }
        />
        <div className="card">
          <DataTable
            columns={columns}
            data={tasks}
            loading={loading}
            emptyText="暂无采摘任务，点击「创建任务」开始规划"
            rowClassName={(row) => (row.priority === '紧急' ? 'row--urgent' : '')}
          />
        </div>
      </div>
      <FormModal
        open={showForm}
        title="创建采摘任务"
        fields={formFields}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
        submitLabel="创建任务"
      />
    </div>
  );
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cls =
    status === '已完成'
      ? 'badge badge--success'
      : status === '执行中'
        ? 'badge badge--info'
        : status === '已取消'
          ? 'badge badge--default'
          : 'badge badge--warning';
  return <span className={cls}>{status}</span>;
}

function TaskActions({
  task,
  onAction,
}: {
  task: PickingTask;
  onAction: (task: PickingTask, status: TaskStatus) => void;
}) {
  if (task.status === '待执行') {
    return (
      <div className="action-group">
        <button
          className="btn btn--sm btn--ghost"
          onClick={() => onAction(task, '执行中')}
        >
          <Play size={14} />
          <span>开始</span>
        </button>
        <button
          className="btn btn--sm btn--ghost btn--danger-text"
          onClick={() => onAction(task, '已取消')}
        >
          <XCircle size={14} />
          <span>取消</span>
        </button>
      </div>
    );
  }
  if (task.status === '执行中') {
    return (
      <div className="action-group">
        <button
          className="btn btn--sm btn--ghost btn--success-text"
          onClick={() => onAction(task, '已完成')}
        >
          <CheckCircle size={14} />
          <span>完成</span>
        </button>
        <button
          className="btn btn--sm btn--ghost btn--danger-text"
          onClick={() => onAction(task, '已取消')}
        >
          <XCircle size={14} />
          <span>取消</span>
        </button>
      </div>
    );
  }
  return <span className="cell-muted">—</span>;
}
