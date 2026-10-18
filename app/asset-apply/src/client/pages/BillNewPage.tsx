import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createBill, type Bill, type BillDraft } from '../api'
import { ApiRequestError, type ApiErrorDetail } from '../platform/api-client'

interface EntryRow {
  key: number
  asset_name: string
  asset_code: string
  spec_model: string
  qty: string
  unit: string
  location: string
  line_remark: string
}

type EntryTextField = Exclude<keyof EntryRow, 'key'>

interface BillFormState {
  pick_date: string
  picker: string
  pick_dept: string
  org: string
  purpose: string
  remark: string
}

const INITIAL_FORM: BillFormState = { pick_date: '', picker: '', pick_dept: '', org: '', purpose: '', remark: '' }

let nextRowKey = 1

function createEntryRow(): EntryRow {
  const key = nextRowKey
  nextRowKey += 1
  return { key, asset_name: '', asset_code: '', spec_model: '', qty: '1', unit: '', location: '', line_remark: '' }
}

/** 与服务端保存校验一致的本地预检（契约 §2 错误表），文案与 details 结构保持一致。 */
function validateDraft(form: BillFormState, entries: EntryRow[]): ApiErrorDetail[] {
  const details: ApiErrorDetail[] = []
  if (!form.pick_date.trim()) details.push({ path: 'pick_date', message: '领用日期不能为空' })
  if (!form.picker.trim()) details.push({ path: 'picker', message: '领用人不能为空' })
  if (!form.pick_dept.trim()) details.push({ path: 'pick_dept', message: '领用部门不能为空' })
  if (!form.org.trim()) details.push({ path: 'org', message: '组织不能为空' })
  if (entries.length === 0) {
    details.push({ path: 'entries', message: '明细分录不能为空' })
  } else {
    entries.forEach((row, index) => {
      if (!row.asset_name.trim()) {
        details.push({ path: `entries[${index}].asset_name`, message: '资产名称不能为空' })
      }
      if (row.qty.trim() === '' || !Number.isFinite(Number(row.qty))) {
        details.push({ path: `entries[${index}].qty`, message: '数量不能为空' })
      }
    })
  }
  return details
}

function toPayload(form: BillFormState, entries: EntryRow[]): BillDraft {
  return {
    pick_date: form.pick_date,
    picker: form.picker.trim(),
    pick_dept: form.pick_dept.trim(),
    org: form.org.trim(),
    purpose: form.purpose,
    remark: form.remark,
    entries: entries.map((row) => ({
      asset_name: row.asset_name.trim(),
      asset_code: row.asset_code,
      spec_model: row.spec_model,
      qty: Number(row.qty),
      unit: row.unit,
      location: row.location,
      line_remark: row.line_remark,
    })),
  }
}

function toFieldErrorMap(details: ApiErrorDetail[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const detail of details) map[detail.path] = detail.message
  return map
}

export default function BillNewPage() {
  const [form, setForm] = useState<BillFormState>(INITIAL_FORM)
  const [entries, setEntries] = useState<EntryRow[]>(() => [createEntryRow()])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdBill, setCreatedBill] = useState<Bill | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!createdBill) return
    const timer = window.setTimeout(() => navigate(`/bills/${createdBill.id}`), 1600)
    return () => window.clearTimeout(timer)
  }, [createdBill, navigate])

  const updateField = (field: keyof BillFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const updateEntry = (key: number, field: EntryTextField, value: string) => {
    setEntries((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  const addEntry = () => setEntries((rows) => [...rows, createEntryRow()])

  const removeEntry = (key: number) => setEntries((rows) => rows.filter((row) => row.key !== key))

  const entryError = (index: number, field: string) => fieldErrors[`entries[${index}].${field}`]

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || createdBill) return
    setFieldErrors({})
    setFormError(null)
    const details = validateDraft(form, entries)
    if (details.length > 0) {
      setFieldErrors(toFieldErrorMap(details))
      setFormError('保存校验未通过，请修正后再提交。')
      return
    }
    setSubmitting(true)
    try {
      const bill = await createBill(toPayload(form, entries))
      setCreatedBill(bill)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.details && err.details.length > 0) setFieldErrors(toFieldErrorMap(err.details))
        setFormError(err.message)
      } else {
        setFormError('保存失败，请稍后重试。')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">新建领用单</h1>
          <p className="page-subtitle">填写领用信息并保存，系统将自动生成领用单号。</p>
        </div>
        <Link to="/" className="btn btn-ghost">返回列表</Link>
      </div>

      {createdBill && (
        <div className="banner banner-success" role="status">
          保存成功，领用单号：{createdBill.billno}，正在打开单据详情…
        </div>
      )}
      {formError && <div className="banner banner-error" role="alert">{formError}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <section className="card form-section">
          <h2 className="card-title">主表信息</h2>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="pick_date">
                领用日期<span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="pick_date"
                type="date"
                value={form.pick_date}
                aria-invalid={Boolean(fieldErrors.pick_date)}
                onChange={(event) => updateField('pick_date', event.target.value)}
              />
              {fieldErrors.pick_date && <p className="field-error">{fieldErrors.pick_date}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="picker">
                领用人<span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="picker"
                type="text"
                value={form.picker}
                aria-invalid={Boolean(fieldErrors.picker)}
                onChange={(event) => updateField('picker', event.target.value)}
              />
              {fieldErrors.picker && <p className="field-error">{fieldErrors.picker}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="pick_dept">
                领用部门<span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="pick_dept"
                type="text"
                value={form.pick_dept}
                aria-invalid={Boolean(fieldErrors.pick_dept)}
                onChange={(event) => updateField('pick_dept', event.target.value)}
              />
              {fieldErrors.pick_dept && <p className="field-error">{fieldErrors.pick_dept}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="org">
                组织<span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="org"
                type="text"
                value={form.org}
                aria-invalid={Boolean(fieldErrors.org)}
                onChange={(event) => updateField('org', event.target.value)}
              />
              {fieldErrors.org && <p className="field-error">{fieldErrors.org}</p>}
            </div>
          </div>
          <div className="form-field form-field-wide">
            <label htmlFor="purpose">用途说明</label>
            <textarea id="purpose" rows={3} value={form.purpose} onChange={(event) => updateField('purpose', event.target.value)} />
          </div>
          <div className="form-field form-field-wide">
            <label htmlFor="remark">备注</label>
            <textarea id="remark" rows={2} value={form.remark} onChange={(event) => updateField('remark', event.target.value)} />
          </div>
        </section>

        <section className="card form-section">
          <div className="card-title-row">
            <h2 className="card-title">明细分录</h2>
            <button type="button" className="btn btn-secondary" onClick={addEntry}>添加分录</button>
          </div>
          <div className="entries-table-wrap">
            <table className="entries-table">
              <thead>
                <tr>
                  <th className="th-seq">#</th>
                  <th>资产名称<span className="required" aria-hidden="true">*</span></th>
                  <th>资产编码</th>
                  <th>规格型号</th>
                  <th>数量<span className="required" aria-hidden="true">*</span></th>
                  <th>单位</th>
                  <th>存放位置</th>
                  <th>备注</th>
                  <th className="th-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td className="entries-empty-row" colSpan={9}>
                      暂无明细分录，请点击「添加分录」录入资产信息。
                    </td>
                  </tr>
                ) : (
                  entries.map((row, index) => (
                    <tr key={row.key}>
                      <td className="td-seq">{index + 1}</td>
                      <td className={entryError(index, 'asset_name') ? 'td-has-error' : undefined}>
                        <input
                          type="text"
                          value={row.asset_name}
                          aria-label={`第 ${index + 1} 行资产名称`}
                          aria-invalid={Boolean(entryError(index, 'asset_name'))}
                          onChange={(event) => updateEntry(row.key, 'asset_name', event.target.value)}
                        />
                        {entryError(index, 'asset_name') && <p className="field-error">{entryError(index, 'asset_name')}</p>}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.asset_code}
                          aria-label={`第 ${index + 1} 行资产编码`}
                          onChange={(event) => updateEntry(row.key, 'asset_code', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.spec_model}
                          aria-label={`第 ${index + 1} 行规格型号`}
                          onChange={(event) => updateEntry(row.key, 'spec_model', event.target.value)}
                        />
                      </td>
                      <td className={entryError(index, 'qty') ? 'td-has-error td-qty' : 'td-qty'}>
                        <input
                          type="number"
                          step="any"
                          value={row.qty}
                          aria-label={`第 ${index + 1} 行数量`}
                          aria-invalid={Boolean(entryError(index, 'qty'))}
                          onChange={(event) => updateEntry(row.key, 'qty', event.target.value)}
                        />
                        {entryError(index, 'qty') && <p className="field-error">{entryError(index, 'qty')}</p>}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.unit}
                          aria-label={`第 ${index + 1} 行单位`}
                          onChange={(event) => updateEntry(row.key, 'unit', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.location}
                          aria-label={`第 ${index + 1} 行存放位置`}
                          onChange={(event) => updateEntry(row.key, 'location', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.line_remark}
                          aria-label={`第 ${index + 1} 行备注`}
                          onChange={(event) => updateEntry(row.key, 'line_remark', event.target.value)}
                        />
                      </td>
                      <td className="td-actions">
                        <button type="button" className="btn btn-danger-ghost" onClick={() => removeEntry(row.key)}>
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {fieldErrors.entries && <p className="field-error">{fieldErrors.entries}</p>}
        </section>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting || Boolean(createdBill)}>
            {submitting ? '保存中…' : '保存'}
          </button>
          <Link to="/" className="btn btn-ghost">取消</Link>
        </div>
      </form>
    </div>
  )
}
