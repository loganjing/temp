import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { DataTable, type Column } from '../../components/DataTable'
import { DateField, SelectField } from '../../components/form'
import { Alert, PageHeader, Pagination, StatusBadge, statusTone } from '../../components/ui'
import { formatDateTime } from '../../platform/format'
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, labelOf } from '../../labels'
import type { JobRun, JobRunSummary, Paged } from '../../types'

const PAGE_SIZE = 20
const JOB_OPTIONS = Object.entries(JOB_TYPE_LABELS).map(([value, label]) => ({ value, label }))
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// 任务执行：手动触发按天/按月计费与合同过期检测（补偿场景），并查询执行记录（job:view；触发需 job:run）。
export default function JobsPage() {
  const { can, orgName } = useSession()
  const [rows, setRows] = useState<JobRun[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [filterType, setFilterType] = useState('')
  const [jobType, setJobType] = useState('daily-billing')
  const [targetDate, setTargetDate] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (filterType) params.set('type', filterType)
    try {
      const result = await apiRequest<Paged<JobRun>>(`/api/jobs/runs?${params.toString()}`)
      setRows(result.items)
      setTotal(result.total)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '任务执行记录加载失败'))
    }
  }, [page, filterType])

  useEffect(() => { void load() }, [load])

  const run = async () => {
    setFormError('')
    setNotice('')
    if (!jobType) { setFormError('任务类型为必选项'); return }
    if (targetDate && !DATE_PATTERN.test(targetDate)) { setFormError('目标日期须为 YYYY-MM-DD 格式'); return }
    setBusy(true)
    try {
      const summary = await apiRequest<JobRunSummary>(`/api/jobs/${encodeURIComponent(jobType)}/run`, {
        method: 'POST',
        body: JSON.stringify(targetDate ? { targetDate } : {}),
      })
      if (summary.status === 'success') {
        setNotice(`任务执行成功（${labelOf(JOB_TYPE_LABELS, summary.jobType)}，目标日期 ${summary.targetDate}）：生成计费明细 ${summary.generatedCount} 条，涉及报价单 ${summary.affectedCount} 个。`)
      } else if (summary.status === 'skipped') {
        setNotice(`任务已跳过（${labelOf(JOB_TYPE_LABELS, summary.jobType)}，目标日期 ${summary.targetDate}）：该任务当日已成功执行过，系统按幂等规则跳过重复执行。`)
      } else {
        setNotice(`任务执行完成但存在失败（${labelOf(JOB_TYPE_LABELS, summary.jobType)}，目标日期 ${summary.targetDate}）：成功生成 ${summary.generatedCount} 条，失败 ${summary.failedCount} 组。${summary.errors.map((item) => `组织「${orgName(item.orgId)}」仓库 ${item.warehouseId} 货主 ${item.ownerId}：${item.message}`).join('；')}`)
      }
      setPage(1)
      await load()
    } catch (cause) {
      setError(errorText(cause, '任务触发失败'))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<JobRun>[] = [
    { key: 'jobType', title: '任务类型', render: (row) => labelOf(JOB_TYPE_LABELS, String(row.jobType)), width: '150px' },
    { key: 'targetDate', title: '目标日期', render: (row) => row.targetDate, width: '110px' },
    { key: 'status', title: '执行状态', render: (row) => <StatusBadge label={labelOf(JOB_STATUS_LABELS, row.status)} tone={statusTone(row.status)} />, width: '90px' },
    { key: 'generatedCount', title: '生成明细数', render: (row) => row.generatedCount, numeric: true, width: '110px' },
    { key: 'affectedCount', title: '影响报价数', render: (row) => row.affectedCount, numeric: true, width: '110px' },
    { key: 'failedCount', title: '失败组数', render: (row) => row.failedCount, numeric: true, width: '90px' },
    { key: 'errorMessage', title: '错误信息', render: (row) => (row.errorMessage ? <span className="cell-ellipsis" title={row.errorMessage}>{row.errorMessage}</span> : <span className="muted">—</span>) },
    { key: 'startedAt', title: '开始时间', render: (row) => formatDateTime(row.startedAt), width: '150px' },
    { key: 'finishedAt', title: '完成时间', render: (row) => formatDateTime(row.finishedAt), width: '150px' },
  ]

  return (
    <div className="section-gap">
      <PageHeader
        title="任务执行记录"
        description="手动触发按天计费、按月计费与合同过期检测任务（补偿场景）；同一任务当日成功执行后自动跳过，失败可重跑。"
      />
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind={notice.includes('失败') ? 'info' : 'success'}>{notice}</Alert>}
      {can('job:run') && (
        <section className="card">
          <div className="card-header"><h2 className="card-title">手动触发任务</h2></div>
          <div className="card-body">
            <div className="form-grid">
              <SelectField
                label="任务类型"
                required
                options={JOB_OPTIONS}
                value={jobType}
                onChange={(value) => setJobType(value)}
                allowEmpty={false}
              />
              <DateField
                label="目标日期（缺省按任务默认日期）"
                value={targetDate}
                onChange={(event) => setTargetDate(event.currentTarget.value)}
                hint="按天计费默认昨日，按月计费默认上月末，合同过期检测默认今日。"
              />
              <div className="field">
                <span className="field-label">&nbsp;</span>
                <button type="button" className="btn" disabled={busy} onClick={() => void run()}>{busy ? '执行中…' : '立即执行'}</button>
                {formError && <span className="field-error" role="alert">{formError}</span>}
              </div>
            </div>
          </div>
        </section>
      )}
      <section className="card">
        <div className="card-body">
          <div className="filter-bar">
            <SelectField
              label="任务类型筛选"
              options={JOB_OPTIONS}
              value={filterType}
              onChange={(value) => { setFilterType(value); setPage(1) }}
            />
            <div className="toolbar">
              <button type="button" className="btn btn-secondary" onClick={() => { setFilterType(''); setPage(1) }}>重置筛选</button>
            </div>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyTitle="暂无任务执行记录"
          emptyDescription="尚未执行过计费或合同过期检测任务；可在上方手动触发。"
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  )
}
