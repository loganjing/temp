import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { apiDownload, apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Badge, Card, ErrorBox, KeyValue, Loading, useResource } from '../ui'
import { ATTACHMENT_CATEGORY_LABELS, CHECKLIST_ITEM_LABELS, CHECKLIST_STATUS_LABELS, displayBytes, displayDateTime, displayMoney, displayNumber } from '../../lib/format'
import type { Attachment, ChecklistStatus, Parcel, ParcelProfile } from '../../types'

const CHECKLIST_ITEMS = Object.keys(CHECKLIST_ITEM_LABELS)
const TEXT_FIELDS = [
  'internalNo', 'state', 'city', 'district', 'address', 'lotInfo', 'currentUse', 'plannedUse', 'zoning', 'allowedDevelopment',
  'paymentTerms', 'landFinancingNote', 'otherGovChargesNote', 'ownershipCompany', 'assetAttribution', 'vendorAskingPrice',
  'conversionPremium', 'developmentCharges', 'totalLandAreaSqft', 'tenureYears',
] as const

/** M02 地块档案：基础/权属/规划字段、核查清单、D4 地价双向录入与附件（AC-01）。 */
export default function ProfileTab({ parcel, reload }: { parcel: Parcel; reload: () => void }) {
  const can = useCan()
  const profile = useResource<ParcelProfile>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/profile`))
  const [form, setForm] = useState<Record<string, string>>({})
  const [tenure, setTenure] = useState('')
  const [needsConversion, setNeedsConversion] = useState(false)
  const [checklist, setChecklist] = useState<Record<string, { status: ChecklistStatus; note: string }>>({})
  const [landPrice, setLandPrice] = useState<{ total: string; unit: string; basis: 'total' | 'unit' }>({ total: '', unit: '', basis: 'total' })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const editable = can('parcel-profile:write')

  useEffect(() => {
    const data = profile.data
    if (!data) return
    const next: Record<string, string> = {}
    for (const key of TEXT_FIELDS) {
      const value = data[key]
      next[key] = value === null || value === undefined ? '' : String(value)
    }
    setForm(next)
    setTenure(data.tenure ?? '')
    setNeedsConversion(data.needsConversion)
    const entries: Record<string, { status: ChecklistStatus; note: string }> = {}
    for (const item of CHECKLIST_ITEMS) entries[item] = { status: 'pending', note: '' }
    for (const entry of data.checklist) {
      if (entries[entry.item]) entries[entry.item] = { status: entry.status, note: entry.note ?? '' }
    }
    setChecklist(entries)
    setLandPrice({ total: data.totalLandPrice ?? '', unit: data.unitLandPrice ?? '', basis: data.landPriceLastEditedBasis === 'unit' ? 'unit' : 'total' })
  }, [profile.data])

  const field = (key: string) => ({
    value: form[key] ?? '',
    onChange: (event: ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: event.currentTarget.value })),
  })

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const body: Record<string, unknown> = {}
    for (const key of TEXT_FIELDS) body[key] = form[key] === '' ? (key === 'tenureYears' ? null : null) : form[key]
    body.tenureYears = form.tenureYears === '' ? null : Number(form.tenureYears)
    body.tenure = tenure === '' ? null : tenure
    body.needsConversion = needsConversion
    body.checklist = CHECKLIST_ITEMS.map((item) => ({ item, status: checklist[item]?.status ?? 'pending', note: checklist[item]?.note || null }))
    // D4 地价双向录入：仅提交最后编辑的一侧 + basis，由服务端按土地面积换算另一侧并回传。
    body.landPriceLastEditedBasis = landPrice.basis
    const priceKey = landPrice.basis === 'total' ? 'totalLandPrice' : 'unitLandPrice'
    body[priceKey] = landPrice[landPrice.basis] === '' ? null : landPrice[landPrice.basis]
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/profile`, { method: 'PATCH', body: JSON.stringify(body) })
      setNotice('档案已保存（地价按最后编辑口径换算并回显）。')
      profile.reload()
      reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (profile.busy && !profile.data) return <Loading />
  if (profile.error) return <Card title="档案加载失败"><ErrorBox cause={profile.error} /></Card>
  if (!profile.data) return null

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <form className="stack" onSubmit={(event) => void saveProfile(event)}>
        <Card title="基础与位置">
          <div className="form-grid">
            <label>内部编号<input {...field('internalNo')} disabled={!editable} /></label>
            <label>州<input {...field('state')} disabled={!editable} placeholder="如 Selangor" /></label>
            <label>城市<input {...field('city')} disabled={!editable} /></label>
            <label>地区<input {...field('district')} disabled={!editable} /></label>
            <label>详细地址<input {...field('address')} disabled={!editable} /></label>
            <label>Lot 信息<input {...field('lotInfo')} disabled={!editable} /></label>
          </div>
          <p className="hint">州/城市/地区会同步台账基础字段；地址与计算口径是两个独立信息。</p>
        </Card>

        <Card title="权属与用途">
          <div className="form-grid">
            <label>产权性质
              <select value={tenure} disabled={!editable} onChange={(event) => setTenure(event.currentTarget.value)}>
                <option value="">未填写</option>
                <option value="freehold">永久产权（freehold）</option>
                <option value="leasehold">租赁产权（leasehold）</option>
              </select>
            </label>
            <label>剩余年限（年）<input {...field('tenureYears')} inputMode="numeric" disabled={!editable} /></label>
            <label>总土地面积（sqft）<input {...field('totalLandAreaSqft')} inputMode="decimal" disabled={!editable} /></label>
            <label>当前用途<input {...field('currentUse')} disabled={!editable} /></label>
            <label>规划用途<input {...field('plannedUse')} disabled={!editable} /></label>
            <label>分区（zoning）<input {...field('zoning')} disabled={!editable} /></label>
            <label>允许开发类型<input {...field('allowedDevelopment')} disabled={!editable} /></label>
            <label>是否需要用途转换
              <select value={needsConversion ? 'yes' : 'no'} disabled={!editable} onChange={(event) => setNeedsConversion(event.currentTarget.value === 'yes')}>
                <option value="no">不需要</option>
                <option value="yes">需要转换</option>
              </select>
            </label>
            <label>转换溢价<input {...field('conversionPremium')} inputMode="decimal" disabled={!editable} /></label>
            <label>发展费（development charges）<input {...field('developmentCharges')} inputMode="decimal" disabled={!editable} /></label>
            <label>其他政府收费说明<input {...field('otherGovChargesNote')} disabled={!editable} /></label>
          </div>
        </Card>

        <Card title="地价与付款（D4 双向录入）">
          <div className="form-grid">
            <label>地主报价<input {...field('vendorAskingPrice')} inputMode="decimal" disabled={!editable} /></label>
            <label>总地价（编辑此项则以总额换算单价）
              <input value={landPrice.total} disabled={!editable} inputMode="decimal"
                onChange={(event) => setLandPrice((prev) => ({ ...prev, total: event.currentTarget.value, basis: 'total' }))} />
            </label>
            <label>单位地价（sqft，编辑此项则以单价换算总额）
              <input value={landPrice.unit} disabled={!editable} inputMode="decimal"
                onChange={(event) => setLandPrice((prev) => ({ ...prev, unit: event.currentTarget.value, basis: 'unit' }))} />
            </label>
            <label>付款条件<input {...field('paymentTerms')} disabled={!editable} /></label>
            <label>土地融资假设<input {...field('landFinancingNote')} disabled={!editable} /></label>
          </div>
          <p className="hint">
            当前计算输入口径：
            <Badge tone="info">{landPrice.basis === 'total' ? '总地价（换算单位地价）' : '单位地价（换算总地价）'}</Badge>
            以最后编辑的字段为计算输入；换算由服务端全精度完成，显示不改写计算值。
          </p>
        </Card>

        <Card title="核查清单（事实/假设/待确认分层）">
          <div className="table-scroll">
            <table>
              <thead><tr><th>核查项</th><th>状态</th><th>备注</th></tr></thead>
              <tbody>
                {CHECKLIST_ITEMS.map((item) => (
                  <tr key={item}>
                    <td>{CHECKLIST_ITEM_LABELS[item]}</td>
                    <td>
                      <select value={checklist[item]?.status ?? 'pending'} disabled={!editable}
                        onChange={(event) => setChecklist((prev) => ({ ...prev, [item]: { status: event.currentTarget.value as ChecklistStatus, note: prev[item]?.note ?? '' } }))}>
                        {Object.entries(CHECKLIST_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td><input value={checklist[item]?.note ?? ''} disabled={!editable} placeholder="假设/待确认说明"
                      onChange={(event) => setChecklist((prev) => ({ ...prev, [item]: { status: prev[item]?.status ?? 'pending', note: event.currentTarget.value } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="权属归属">
          <div className="form-grid">
            <label>地块所有权（公司）<input {...field('ownershipCompany')} disabled={!editable} /></label>
            <label>资产归属<input {...field('assetAttribution')} disabled={!editable} /></label>
          </div>
          <p className="hint">权属归公司资产，不绑在个人名下。</p>
        </Card>

        {editable && (
          <Card>
            <button disabled={busy}>{busy ? '保存中…' : '保存档案'}</button>
          </Card>
        )}
      </form>

      <AttachmentsCard parcel={parcel} />
    </div>
  )
}

function AttachmentsCard({ parcel }: { parcel: Parcel }) {
  const can = useCan()
  const attachments = useResource<{ items: Attachment[] }>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/attachments`))
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const editable = can('parcels:write') && parcel.status !== 'completed'

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = new FormData(form)
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/attachments`, { method: 'POST', body: data })
      form.reset()
      setNotice('附件已上传。')
      attachments.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (attachment: Attachment) => {
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/attachments/${encodeURIComponent(attachment.id)}`, { method: 'DELETE' })
      setNotice('附件已删除。')
      attachments.reload()
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  return (
    <Card title={`附件（${attachments.data?.items.length ?? 0}）`}>
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {editable && (
        <form className="form-grid" onSubmit={(event) => void upload(event)} style={{ marginBottom: '0.9rem' }}>
          <label>类别
            <select name="category" defaultValue="other">
              {Object.entries(ATTACHMENT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>文件 *<input name="file" type="file" required /></label>
          <label className="span-2">备注<input name="note" maxLength={2000} /></label>
          <button disabled={busy}>{busy ? '上传中…' : '上传附件'}</button>
        </form>
      )}
      {parcel.status === 'completed' && <p className="hint">已完成地块的附件只读保留（不再接受上传/删除）。</p>}
      {attachments.busy && !attachments.data && <Loading />}
      <ErrorBox cause={attachments.error} />
      {attachments.data && attachments.data.items.length === 0 && <p className="hint">暂无附件。</p>}
      {attachments.data && attachments.data.items.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead><tr><th>文件</th><th>类别</th><th>大小</th><th>备注</th><th>上传时间</th><th>操作</th></tr></thead>
            <tbody>
              {attachments.data.items.map((attachment) => (
                <tr key={attachment.id}>
                  <td><strong title={attachment.fileName}>{attachment.fileName}</strong></td>
                  <td>{ATTACHMENT_CATEGORY_LABELS[attachment.category] ?? attachment.category}</td>
                  <td className="num">{displayBytes(attachment.size)}</td>
                  <td>{attachment.note ?? '—'}</td>
                  <td className="nowrap">{displayDateTime(attachment.uploadedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="secondary" onClick={() => void apiDownload(`/api/parcels/${encodeURIComponent(parcel.id)}/attachments/${encodeURIComponent(attachment.id)}`, attachment.fileName)}>下载</button>
                      {editable && <button className="secondary" onClick={() => void remove(attachment)}>删除</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {attachments.data && (
        <KeyValue rows={[['地块状态', parcel.status], ['附件记录', `共 ${displayNumber(attachments.data.items.length)} 个`]]} />
      )}
    </Card>
  )
}
