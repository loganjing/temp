import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, PageHeader } from '../../components/ui'
import { DateField, SelectField, TextareaField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import type { Adjustment } from '../../types'

// 新建应收费用调整单：组织 + 业务周期 + 备注；创建后跳转编辑页加载暂存明细。
// billNo 由系统自动生成（YSTZ-YYYYMMDD-NNNNN），页面只读。
export default function AdjustmentCreate() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [orgId, setOrgId] = useState(user?.orgId ?? '')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [remark, setRemark] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!orgId) errors.orgId = '组织机构为必填项'
    if (!periodStart) errors.periodStart = '业务周期开始为必填项'
    if (!periodEnd) errors.periodEnd = '业务周期结束为必填项'
    if (periodStart && periodEnd && periodStart > periodEnd) errors.periodEnd = '业务周期结束不可早于开始'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setBusy(true)
    setError('')
    try {
      const created = await apiRequest<Adjustment>('/api/adjustments', {
        method: 'POST',
        body: JSON.stringify({ orgId, periodStart, periodEnd, remark: remark.trim() || null }),
      })
      navigate(`/adjustments/${created.id}`, { replace: true })
    } catch (cause) {
      setError(errorText(cause, '调整单创建失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="section-gap">
      <PageHeader
        title="新建应收费用调整单"
        description="创建后进入编辑页：按业务周期加载暂存明细或手动新增空白行，录入正数调整金额与调整原因。"
        actions={<Link className="btn btn-secondary" to="/adjustments">返回列表</Link>}
      />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="card">
        <div className="card-header"><h2 className="card-title">头部信息</h2></div>
        <form className="card-body" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <SelectField label="组织机构" required options={orgs.options} value={orgId} error={fieldErrors.orgId} onChange={(value) => setOrgId(value)} hint="调整单按组织隔离" />
            <DateField label="业务周期-开始" required value={periodStart} error={fieldErrors.periodStart} onChange={(event) => setPeriodStart(event.currentTarget.value)} hint="【添加费用明细】仅加载周期内暂存应收明细" />
            <DateField label="业务周期-结束" required value={periodEnd} error={fieldErrors.periodEnd} onChange={(event) => setPeriodEnd(event.currentTarget.value)} />
          </div>
          <div style={{ marginTop: 14 }}>
            <TextareaField label="备注（选填）" value={remark} maxLength={500} placeholder="调整依据、客户沟通说明等" onChange={(event) => setRemark(event.currentTarget.value)} />
          </div>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button type="submit" className="btn" disabled={busy}>{busy ? '创建中…' : '创建并继续'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
