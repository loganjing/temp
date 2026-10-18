import { useMemo, useState, type FormEvent } from 'react'
import { apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Banner, Card, EmptyState, ErrorBox, Loading, StatusBadge, useResource } from '../ui'
import { CONFIDENCE_LABELS, FORMAT_LABELS, LISTING_STATUS_LABELS, SOURCE_TYPE_LABELS, displayDateTime, displayMoney, displayNumber, displayPercent } from '../../lib/format'
import type { Comp, LandRef, Paged, Parcel } from '../../types'
import AiSuggestionPanel from './AiSuggestionPanel'

const SOURCE_TYPES = Object.keys(SOURCE_TYPE_LABELS)
const CONFIDENCES = Object.keys(CONFIDENCE_LABELS)
const LISTING_STATUSES = Object.keys(LISTING_STATUS_LABELS)
const COMP_FORMATS = ['residential', 'apartment', 'service-apartment', 'hotel', 'office', 'retail', 'other']

const formValue = (data: FormData, key: string): string | null => {
  const value = String(data.get(key) ?? '').trim()
  return value === '' ? null : value
}

/** M04 市场研究：土地交易参考与竞品分表（不可混用），筛选 + 手工录入（AC-01）。 */
export default function MarketTab({ parcel }: { parcel: Parcel }) {
  const can = useCan()
  const editable = can('market:write')
  const [refFilters, setRefFilters] = useState({ distanceKm: '', from: '', to: '' })
  const [compFilters, setCompFilters] = useState({ distanceKm: '', format: '', status: '' })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refUrl = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '100' })
    if (refFilters.distanceKm.trim()) params.set('distanceKm', refFilters.distanceKm.trim())
    if (refFilters.from) params.set('from', refFilters.from)
    if (refFilters.to) params.set('to', refFilters.to)
    return `/api/parcels/${encodeURIComponent(parcel.id)}/market/land-refs?${params.toString()}`
  }, [parcel.id, refFilters])
  const landRefs = useResource<Paged<LandRef>>(() => apiRequest(refUrl), [refUrl])

  const compUrl = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '100' })
    if (compFilters.distanceKm.trim()) params.set('distanceKm', compFilters.distanceKm.trim())
    if (compFilters.format) params.set('format', compFilters.format)
    if (compFilters.status) params.set('status', compFilters.status)
    return `/api/parcels/${encodeURIComponent(parcel.id)}/market/comps?${params.toString()}`
  }, [parcel.id, compFilters])
  const comps = useResource<Paged<Comp>>(() => apiRequest(compUrl), [compUrl])

  const createLandRef = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/market/land-refs`, {
        method: 'POST',
        body: JSON.stringify({
          projectName: String(data.get('projectName') ?? '').trim(),
          distanceKm: formValue(data, 'distanceKm'),
          dealPrice: formValue(data, 'dealPrice'),
          pricePerSqft: formValue(data, 'pricePerSqft'),
          priceToRevenueRatio: formValue(data, 'priceToRevenueRatio'),
          transactedAt: formValue(data, 'transactedAt'),
          dealCondition: formValue(data, 'dealCondition'),
          listingStatus: String(data.get('listingStatus') ?? 'unknown'),
          source: String(data.get('source') ?? '').trim(),
          sourceType: String(data.get('sourceType') ?? 'market-judgment'),
          confidence: String(data.get('confidence') ?? 'unverified'),
          note: formValue(data, 'note'),
        }),
      })
      form.reset()
      setNotice('土地交易参考已录入。')
      landRefs.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const createComp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const totalUnits = formValue(data, 'totalUnits')
    const soldUnits = formValue(data, 'soldUnits')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/market/comps`, {
        method: 'POST',
        body: JSON.stringify({
          projectName: String(data.get('projectName') ?? '').trim(),
          distanceKm: formValue(data, 'distanceKm'),
          format: String(data.get('format') ?? 'other'),
          typeTier: formValue(data, 'typeTier'),
          unitAreaFrom: formValue(data, 'unitAreaFrom'),
          unitAreaTo: formValue(data, 'unitAreaTo'),
          askingPrice: formValue(data, 'askingPrice'),
          pricePerSqft: formValue(data, 'pricePerSqft'),
          totalUnits: totalUnits === null ? null : Number(totalUnits),
          soldUnits: soldUnits === null ? null : Number(soldUnits),
          absorptionRate: formValue(data, 'absorptionRate'),
          positioning: formValue(data, 'positioning'),
          incentives: formValue(data, 'incentives'),
          affordableFlag: data.get('affordableFlag') === 'on',
          projectStatus: formValue(data, 'projectStatus'),
          source: String(data.get('source') ?? '').trim(),
          sourceType: String(data.get('sourceType') ?? 'market-judgment'),
          confidence: String(data.get('confidence') ?? 'unverified'),
          note: formValue(data, 'note'),
        }),
      })
      form.reset()
      setNotice('竞品已录入。')
      comps.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <Banner tone="info">
        土地交易参考（历史地价）与住宅/商业竞品分表维护：土地成交价不能直接当住宅售价，竞品报价不能当已验证成交价；
        unverified 条目为待确认资料，不构成正式结论唯一依据。
      </Banner>

      <Card title={`土地交易参考（${landRefs.data?.total ?? 0}）`}>
        <div className="toolbar">
          <label className="field">距离 ≤（km）<input inputMode="decimal" value={refFilters.distanceKm} onChange={(event) => setRefFilters((prev) => ({ ...prev, distanceKm: event.currentTarget.value }))} /></label>
          <label className="field">成交起<input type="date" value={refFilters.from} onChange={(event) => setRefFilters((prev) => ({ ...prev, from: event.currentTarget.value }))} /></label>
          <label className="field">成交止<input type="date" value={refFilters.to} onChange={(event) => setRefFilters((prev) => ({ ...prev, to: event.currentTarget.value }))} /></label>
        </div>
        {landRefs.busy && !landRefs.data && <Loading />}
        <ErrorBox cause={landRefs.error} />
        {landRefs.data && landRefs.data.items.length === 0 && <EmptyState text="暂无土地交易参考记录。" />}
        {landRefs.data && landRefs.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>项目</th><th className="num">距离(km)</th><th className="num">成交价</th><th className="num">单价/sqft</th><th className="num">地价/收入比</th>
                  <th>成交时间</th><th>交易条件</th><th>挂牌状态</th><th>来源/类型</th><th>可信度</th><th>采集时间</th><th>备注</th></tr>
              </thead>
              <tbody>
                {landRefs.data.items.map((item) => (
                  <tr key={item.id}>
                    <td><strong title={item.projectName}>{item.projectName}</strong></td>
                    <td className="num">{displayNumber(item.distanceKm)}</td>
                    <td className="num">{displayMoney(item.dealPrice)}</td>
                    <td className="num">{displayMoney(item.pricePerSqft)}</td>
                    <td className="num">{displayPercent(item.priceToRevenueRatio)}</td>
                    <td className="nowrap">{item.transactedAt ?? '—'}</td>
                    <td title={item.dealCondition ?? ''}>{item.dealCondition ?? '—'}</td>
                    <td>{LISTING_STATUS_LABELS[item.listingStatus] ?? item.listingStatus}</td>
                    <td><span className="subtext" title={item.source}>{item.source}</span><span className="subtext">{SOURCE_TYPE_LABELS[item.sourceType] ?? item.sourceType}</span></td>
                    <td><StatusBadge status={item.confidence} label={CONFIDENCE_LABELS[item.confidence] ?? item.confidence} /></td>
                    <td className="nowrap">{displayDateTime(item.collectedAt)}</td>
                    <td title={item.note ?? ''}>{item.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editable && (
        <Card title="录入土地交易参考">
          <form className="form-grid" onSubmit={(event) => void createLandRef(event)}>
            <label>项目名称 *<input name="projectName" required maxLength={200} /></label>
            <label>距离（km）<input name="distanceKm" inputMode="decimal" /></label>
            <label>成交价<input name="dealPrice" inputMode="decimal" /></label>
            <label>单价（/sqft）<input name="pricePerSqft" inputMode="decimal" /></label>
            <label>地价/收入比<input name="priceToRevenueRatio" inputMode="decimal" /></label>
            <label>成交时间<input name="transactedAt" type="date" /></label>
            <label>交易条件<input name="dealCondition" maxLength={500} /></label>
            <label>挂牌状态<select name="listingStatus" defaultValue="unknown">{LISTING_STATUSES.map((value) => <option key={value} value={value}>{LISTING_STATUS_LABELS[value]}</option>)}</select></label>
            <label>资料来源 *<input name="source" required maxLength={500} placeholder="如 政府交易记录 / 经纪 / 报道" /></label>
            <label>来源类型 *<select name="sourceType" defaultValue="market-judgment">{SOURCE_TYPES.map((value) => <option key={value} value={value}>{SOURCE_TYPE_LABELS[value]}</option>)}</select></label>
            <label>可信度<select name="confidence" defaultValue="unverified">{CONFIDENCES.map((value) => <option key={value} value={value}>{CONFIDENCE_LABELS[value]}</option>)}</select></label>
            <label className="span-2">备注<input name="note" maxLength={2000} /></label>
            <button disabled={busy}>{busy ? '保存中…' : '保存土地参考'}</button>
          </form>
        </Card>
      )}

      <Card title={`住宅/商业竞品（${comps.data?.total ?? 0}）`}>
        <div className="toolbar">
          <label className="field">距离 ≤（km）<input inputMode="decimal" value={compFilters.distanceKm} onChange={(event) => setCompFilters((prev) => ({ ...prev, distanceKm: event.currentTarget.value }))} /></label>
          <label className="field">业态
            <select value={compFilters.format} onChange={(event) => setCompFilters((prev) => ({ ...prev, format: event.currentTarget.value }))}>
              <option value="">全部</option>
              {COMP_FORMATS.map((value) => <option key={value} value={value}>{FORMAT_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="field">项目状态<input value={compFilters.status} onChange={(event) => setCompFilters((prev) => ({ ...prev, status: event.currentTarget.value }))} placeholder="如 unknown/在售" /></label>
        </div>
        {comps.busy && !comps.data && <Loading />}
        <ErrorBox cause={comps.error} />
        {comps.data && comps.data.items.length === 0 && <EmptyState text="暂无竞品记录。" />}
        {comps.data && comps.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>项目</th><th className="num">距离(km)</th><th>业态</th><th>档次</th><th className="num">户型面积(sqft)</th><th className="num">报价</th><th className="num">单价/sqft</th>
                  <th className="num">总户数</th><th className="num">已售</th><th className="num">去化率</th><th>定位</th><th>可负担</th><th>项目状态</th><th>来源/类型</th><th>可信度</th><th>采集时间</th></tr>
              </thead>
              <tbody>
                {comps.data.items.map((item) => (
                  <tr key={item.id}>
                    <td><strong title={item.projectName}>{item.projectName}</strong></td>
                    <td className="num">{displayNumber(item.distanceKm)}</td>
                    <td>{FORMAT_LABELS[item.format] ?? item.format}</td>
                    <td>{item.typeTier ?? '—'}</td>
                    <td className="num">{item.unitAreaFrom === null && item.unitAreaTo === null ? '—' : `${displayNumber(item.unitAreaFrom)}–${displayNumber(item.unitAreaTo)}`}</td>
                    <td className="num">{displayMoney(item.askingPrice)}</td>
                    <td className="num">{displayMoney(item.pricePerSqft)}</td>
                    <td className="num">{displayNumber(item.totalUnits)}</td>
                    <td className="num">{displayNumber(item.soldUnits)}</td>
                    <td className="num">{displayNumber(item.absorptionRate)}</td>
                    <td title={item.positioning ?? ''}>{item.positioning ?? '—'}</td>
                    <td>{item.affordableFlag ? '是' : '否'}</td>
                    <td>{item.projectStatus ?? '—'}</td>
                    <td><span className="subtext" title={item.source}>{item.source}</span><span className="subtext">{SOURCE_TYPE_LABELS[item.sourceType] ?? item.sourceType}</span></td>
                    <td><StatusBadge status={item.confidence} label={CONFIDENCE_LABELS[item.confidence] ?? item.confidence} /></td>
                    <td className="nowrap">{displayDateTime(item.collectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editable && (
        <Card title="录入竞品">
          <form className="form-grid" onSubmit={(event) => void createComp(event)}>
            <label>项目名称 *<input name="projectName" required maxLength={200} /></label>
            <label>距离（km）<input name="distanceKm" inputMode="decimal" /></label>
            <label>业态 *<select name="format" defaultValue="residential">{COMP_FORMATS.map((value) => <option key={value} value={value}>{FORMAT_LABELS[value]}</option>)}</select></label>
            <label>产品档次/户型<input name="typeTier" maxLength={100} placeholder="如 Type A/B、可负担" /></label>
            <label>户型面积起（sqft）<input name="unitAreaFrom" inputMode="decimal" /></label>
            <label>户型面积止（sqft）<input name="unitAreaTo" inputMode="decimal" /></label>
            <label>报价（总价）<input name="askingPrice" inputMode="decimal" /></label>
            <label>单价（/sqft）<input name="pricePerSqft" inputMode="decimal" /></label>
            <label>总户数<input name="totalUnits" inputMode="numeric" /></label>
            <label>已售户数<input name="soldUnits" inputMode="numeric" /></label>
            <label>去化率<input name="absorptionRate" inputMode="decimal" /></label>
            <label>市场定位<input name="positioning" maxLength={200} /></label>
            <label>优惠<input name="incentives" maxLength={500} /></label>
            <label>可负担产品<input name="affordableFlag" type="checkbox" /></label>
            <label>项目状态<input name="projectStatus" maxLength={40} placeholder="如 在售/售罄/未知" /></label>
            <label>资料来源 *<input name="source" required maxLength={500} /></label>
            <label>来源类型 *<select name="sourceType" defaultValue="market-judgment">{SOURCE_TYPES.map((value) => <option key={value} value={value}>{SOURCE_TYPE_LABELS[value]}</option>)}</select></label>
            <label>可信度<select name="confidence" defaultValue="unverified">{CONFIDENCES.map((value) => <option key={value} value={value}>{CONFIDENCE_LABELS[value]}</option>)}</select></label>
            <label className="span-2">备注<input name="note" maxLength={2000} /></label>
            <button disabled={busy}>{busy ? '保存中…' : '保存竞品'}</button>
          </form>
        </Card>
      )}

      <AiSuggestionPanel
        parcelId={parcel.id}
        kind="market-summary"
        canGenerate={can('quick-assessments:write')}
        canConfirm={can('plans:write')}
        promptPlaceholder="如：汇总本地块周边土地参考与竞品要点，指出资料缺口"
        onConfirmed={() => comps.reload()}
      />
    </div>
  )
}
