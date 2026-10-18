import { useEffect, useState, type ChangeEvent } from 'react'
import { Badge, Card, EmptyState, ErrorBox, KeyValue, Loading, StatusBadge, useResource } from '../ui'
import {
  ALLOCATION_BASIS_LABELS, COST_BASIS_LABELS, COST_CATEGORY_LABELS, FORMAT_LABELS, LAND_ALLOCATION_LABELS,
  PLAN_KIND_LABELS, PLAN_STATUS_LABELS, SOURCE_TYPE_LABELS, displayDateTime,
} from '../../lib/format'
import { apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import type { ParameterSet, ParcelDetail, Paged, PlanInputs, PlanProductInput, PlanResource } from '../../types'
import PlanResultsView from './PlanResultsView'
import PlanAnalysisPanel from './PlanAnalysisPanel'
import AiSuggestionPanel from './AiSuggestionPanel'

const COST_CATEGORIES = Object.keys(COST_CATEGORY_LABELS)
const COST_BASES = Object.keys(COST_BASIS_LABELS)
const SOURCE_TYPE_KEYS = Object.keys(SOURCE_TYPE_LABELS)
const PRODUCT_FORMATS = Object.keys(FORMAT_LABELS)
const ALLOCATION_BASES = Object.keys(ALLOCATION_BASIS_LABELS)
const LAND_ALLOCATION_METHODS = Object.keys(LAND_ALLOCATION_LABELS)
const DENSITY_BASES: Record<string, string> = { 'plot-ratio': '容积率', 'units-per-acre': '每英亩单位数' }
const PRICE_BASES: Record<string, string> = { 'unit-price': '单位总价', 'per-sqft': '每 sqft 单价', 'policy-fixed': '政策固定价（可负担价）' }
const COST_STATUSES: Record<string, string> = { confirmed: '已确认', zero: '为零', pending: '待确认' }
const NFA_MODES: Record<string, string> = { 'convention-default': '口径默认效率', manual: '手工效率' }
const PARKING_USED_BASIS: Record<string, string> = { gov: '政府最低要求', internal: '内部目标' }
const LAND_BASIS_LABELS: Record<string, string> = { total: '总价', 'per-sqft': '单价/sqft' }

type DraftPhase = PlanInputs['phases'][number] & { gfaBreakdownText: string }
type DraftPool = PlanInputs['commonPools'][number] & { ratiosText: string }
type Draft = Omit<PlanInputs, 'phases' | 'commonPools'> & { phases: DraftPhase[]; commonPools: DraftPool[] }

let tempCounter = 0
const nextTempId = (): string => `tmp-${(tempCounter += 1)}`

function toDraft(inputs: PlanInputs): Draft {
  return {
    ...inputs,
    phases: inputs.phases.map((phase) => ({
      ...phase,
      gfaBreakdownText: phase.gfaBreakdown && Object.keys(phase.gfaBreakdown).length > 0 ? JSON.stringify(phase.gfaBreakdown, null, 1) : '',
    })),
    commonPools: inputs.commonPools.map((pool) => ({
      ...pool,
      ratiosText: pool.customRatios && Object.keys(pool.customRatios).length > 0 ? JSON.stringify(pool.customRatios, null, 1) : '',
    })),
  }
}

/** 空文本按 null 提交；JSON 字段失败时抛出中文提示（提交前拦截）。 */
function parseJsonField(text: string): Record<string, string> | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('JSON 格式无效，请检查 GFA 分摊/比例输入')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('JSON 必须是对象（如 {"total": "250000"}）')
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]))
}

function buildPayload(draft: Draft): Record<string, unknown> {
  return {
    areaBasis: draft.areaBasis,
    landPrice: draft.landPrice,
    parking: draft.parking,
    phases: draft.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      seq: phase.seq,
      landAllocation: phase.landAllocation,
      gfaBreakdown: parseJsonField(phase.gfaBreakdownText),
      products: phase.products.map((product) => ({
        id: product.id,
        format: product.format,
        tier: product.tier === '' ? null : product.tier,
        sharePct: product.sharePct,
        units: product.units,
        unitAreaSqft: product.unitAreaSqft,
        saleableAreaSqft: product.saleableAreaSqft,
        price: product.price === '' ? null : product.price,
        pricePerSqft: product.pricePerSqft === '' ? null : product.pricePerSqft,
        priceBasis: product.priceBasis,
        bumiQuotaPct: product.bumiQuotaPct === '' ? null : product.bumiQuotaPct,
        bumiDiscountPct: product.bumiDiscountPct === '' ? null : product.bumiDiscountPct,
        affordableQuota: product.affordableQuota && (product.affordableQuota.units || product.affordableQuota.price)
          ? { units: Number(product.affordableQuota.units ?? 0), price: product.affordableQuota.price ?? '0' }
          : null,
        parkingPerUnit: product.parkingPerUnit === '' ? null : product.parkingPerUnit,
      })),
    })),
    costs: draft.costs.map((item) => ({ ...item, phaseId: item.phaseId === '' ? null : item.phaseId, note: item.note === '' ? null : item.note })),
    commonPools: draft.commonPools.map((pool) => ({
      id: pool.id,
      category: pool.category,
      amount: pool.amount,
      allocationBasis: pool.allocationBasis,
      customRatios: pool.allocationBasis === 'custom-ratio' ? parseJsonField(pool.ratiosText) : null,
      ruleNote: pool.ruleNote === '' ? null : pool.ruleNote,
    })),
  }
}

const numberOrZero = (event: ChangeEvent<HTMLInputElement>): number => {
  const value = Number(event.currentTarget.value)
  return Number.isFinite(value) ? value : 0
}
const optionalNumber = (event: ChangeEvent<HTMLInputElement>): number | null => {
  const raw = event.currentTarget.value
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** 方案编辑器：输入保存并重算（服务端权威）、正式化、复制派生、口径切换。 */
export default function PlanEditor({
  planId, parcel, reloadList, selectPlan, reloadParcel,
}: {
  planId: string
  parcel: ParcelDetail
  reloadList: () => void
  selectPlan: (planId: string) => void
  reloadParcel: () => void
}) {
  const can = useCan()
  const plan = useResource<PlanResource>(() => apiRequest(`/api/plans/${encodeURIComponent(planId)}`), [planId])
  const conventions = useResource<Paged<ParameterSet>>(() => apiRequest('/api/parameters?kind=area-convention&pageSize=50'), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copyNote, setCopyNote] = useState('')
  const [conventionId, setConventionId] = useState('')
  const [conventionReason, setConventionReason] = useState('')

  // 服务端数据（加载/重载）→ 同步草稿（保存后服务端返回新行 ID 的规范输入）。
  useEffect(() => {
    if (plan.data) setDraft(toDraft(plan.data.inputs))
  }, [plan.data])

  // 切换方案时清空本地操作状态。
  useEffect(() => {
    setError('')
    setNotice('')
    setCopyNote('')
    setConventionId('')
    setConventionReason('')
  }, [planId])

  const status = plan.data?.status ?? 'draft'
  const editableStatus = status === 'draft' || status === 'saved'
  const canEdit = can('plans:write') && editableStatus

  const patchDraft = (mutate: (current: Draft) => Draft) =>
    setDraft((current) => (current === null ? current : mutate(current)))
  const patchArea = (patch: Partial<PlanInputs['areaBasis']>) =>
    patchDraft((current) => ({ ...current, areaBasis: { ...current.areaBasis, ...patch } }))
  const patchParking = (patch: Partial<PlanInputs['parking']>) =>
    patchDraft((current) => ({ ...current, parking: { ...current.parking, ...patch } }))
  const patchLandPrice = (patch: Partial<PlanInputs['landPrice']>) =>
    patchDraft((current) => ({ ...current, landPrice: { ...current.landPrice, ...patch } }))
  const patchPhase = (index: number, patch: Partial<DraftPhase>) =>
    patchDraft((current) => ({ ...current, phases: current.phases.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)) }))
  const patchProduct = (phaseIndex: number, productIndex: number, patch: Partial<PlanProductInput>) =>
    patchDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, i) =>
        i === phaseIndex ? { ...phase, products: phase.products.map((product, j) => (j === productIndex ? { ...product, ...patch } : product)) } : phase),
    }))
  const patchCost = (index: number, patch: Partial<PlanInputs['costs'][number]>) =>
    patchDraft((current) => ({ ...current, costs: current.costs.map((item, i) => (i === index ? { ...item, ...patch } : item)) }))
  const patchPool = (index: number, patch: Partial<DraftPool>) =>
    patchDraft((current) => ({ ...current, commonPools: current.commonPools.map((pool, i) => (i === index ? { ...pool, ...patch } : pool)) }))

  const addPhase = () =>
    patchDraft((current) => ({
      ...current,
      phases: [...current.phases, {
        id: nextTempId(), name: `期次 ${current.phases.length + 1}`, seq: current.phases.length + 1,
        landAllocation: { method: 'by-land-area', value: null }, products: [], gfaBreakdown: null, gfaBreakdownText: '',
      }],
    }))
  const removePhase = (index: number) =>
    patchDraft((current) => {
      const removed = current.phases[index]
      return {
        ...current,
        phases: current.phases.filter((_, i) => i !== index),
        costs: current.costs.map((item) => (item.phaseId === removed?.id ? { ...item, phaseId: null } : item)),
      }
    })
  const addProduct = (phaseIndex: number) =>
    patchDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, i) => (i === phaseIndex ? {
        ...phase,
        products: [...phase.products, {
          id: nextTempId(), format: 'residential', tier: null, sharePct: '0', units: 0, unitAreaSqft: '0', saleableAreaSqft: '0',
          price: null, pricePerSqft: null, priceBasis: 'unit-price', bumiQuotaPct: null, bumiDiscountPct: null,
          affordableQuota: null, parkingPerUnit: null,
        }],
      } : phase)),
    }))
  const removeProduct = (phaseIndex: number, productIndex: number) =>
    patchDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, i) =>
        i === phaseIndex ? { ...phase, products: phase.products.filter((_, j) => j !== productIndex) } : phase),
    }))
  const addCost = () =>
    patchDraft((current) => ({
      ...current,
      costs: [...current.costs, {
        id: nextTempId(), phaseId: null, category: 'construction', itemName: '', basis: 'fixed', value: '0',
        sourceType: 'manual-estimate', status: 'pending', note: null,
      }],
    }))
  const removeCost = (index: number) => patchDraft((current) => ({ ...current, costs: current.costs.filter((_, i) => i !== index) }))
  const addPool = () =>
    patchDraft((current) => ({
      ...current,
      commonPools: [...current.commonPools, {
        id: nextTempId(), category: 'infrastructure', amount: '0', allocationBasis: 'saleable-area', customRatios: null, ruleNote: null, ratiosText: '',
      }],
    }))
  const removePool = (index: number) => patchDraft((current) => ({ ...current, commonPools: current.commonPools.filter((_, i) => i !== index) }))

  const save = async () => {
    if (draft === null) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = buildPayload(draft)
      await apiRequest(`/api/plans/${encodeURIComponent(planId)}/inputs`, { method: 'PATCH', body: JSON.stringify(payload) })
      setNotice('输入已保存并重算。')
      plan.reload()
      reloadList()
      reloadParcel()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const formalize = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest<PlanResource & { snapshotId?: string | null }>(
        `/api/plans/${encodeURIComponent(planId)}/formalize`,
        { method: 'POST' },
      )
      setNotice(result.snapshotId ? `方案已正式化（快照 ${result.snapshotId}）。` : '方案已处于正式化后的状态（返回最新快照）。')
      plan.reload()
      reloadList()
      reloadParcel()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const copyPlan = async () => {
    const note = copyNote.trim()
    if (note === '') {
      setError('请填写复制变更说明（必填）。')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await apiRequest<PlanResource>(`/api/plans/${encodeURIComponent(planId)}/copy`, {
        method: 'POST',
        body: JSON.stringify({ changeNote: note, asKind: 'candidate' }),
      })
      setCopyNote('')
      setNotice(`已派生候选方案「${created.name}」。`)
      reloadList()
      selectPlan(created.id)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const switchConvention = async () => {
    if (conventionId === '' || conventionReason.trim() === '') {
      setError('请选择面积口径版本并填写切换原因。')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/plans/${encodeURIComponent(planId)}/area-convention`, {
        method: 'POST',
        body: JSON.stringify({ areaConventionId: conventionId, reason: conventionReason.trim() }),
      })
      setConventionId('')
      setConventionReason('')
      setNotice('面积口径已切换并重算。')
      plan.reload()
      reloadList()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (plan.busy && !plan.data) return <Loading />
  if (plan.error) return <Card title="方案加载失败"><ErrorBox cause={plan.error} /></Card>
  if (!plan.data || draft === null) return <Loading />

  const data = plan.data

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <Card
        title={<span>方案：{data.name} <StatusBadge status={data.status} label={PLAN_STATUS_LABELS[data.status]} /></span>}
        actions={
          <div className="row-actions">
            {canEdit && <button disabled={busy} onClick={() => void save()}>保存并重算</button>}
            {can('plans:formalize') && editableStatus && <button disabled={busy} onClick={() => void formalize()}>正式化</button>}
          </div>
        }
      >
        <KeyValue
          rows={[
            ['类型', PLAN_KIND_LABELS[data.kind] ?? data.kind],
            ['状态', PLAN_STATUS_LABELS[data.status] ?? data.status],
            ['期次数', String(data.phaseCount)],
            ['来源方案', data.sourcePlanId ?? '—'],
            ['复制时间', displayDateTime(data.copiedAt)],
            ['变更说明', data.changeNote ?? '—'],
            ['创建时间', displayDateTime(data.createdAt)],
            ['更新时间', displayDateTime(data.updatedAt)],
            ['快照', data.snapshotId ?? '—'],
          ]}
        />
        {data.assumptionTags.length > 0 && (
          <div className="chips" style={{ marginTop: '0.5rem' }}>
            {data.assumptionTags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        )}
        {data.parameterRefs.areaConventionId !== null && (
          <p className="hint">引用口径参数：{data.parameterRefs.areaConventionId}</p>
        )}
        {!editableStatus && (
          <p className="hint">当前状态（{PLAN_STATUS_LABELS[data.status] ?? data.status}）已锁定输入；如需调整请复制派生新方案。</p>
        )}
      </Card>

      {can('plans:copy') && (
        <Card title="复制为候选方案">
          <p className="hint">输入原样复制，行 ID 由服务端重新生成；新方案为草稿状态，需另行编辑。</p>
          <div className="toolbar">
            <label className="grow">变更说明（必填）
              <input value={copyNote} onChange={(event) => setCopyNote(event.currentTarget.value)} maxLength={2000} placeholder="如：容积率 +0.5 的敏感性版本" />
            </label>
            <button disabled={busy} onClick={() => void copyPlan()}>复制</button>
          </div>
        </Card>
      )}

      {canEdit && (
        <Card title="切换面积口径">
          <p className="hint">切换需填写原因并留痕；口径影响效率与面积换算，切换后自动重算。</p>
          <div className="toolbar">
            <label className="grow">口径版本
              <select value={conventionId} onChange={(event) => setConventionId(event.currentTarget.value)}>
                <option value="">请选择</option>
                {(conventions.data?.items ?? []).map((parameter) => (
                  <option key={parameter.id} value={parameter.id}>
                    {`${String((parameter.content as { name?: string } | null)?.name ?? parameter.kind)} v${parameter.version}${parameter.region ? ` @${parameter.region}` : ''}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="grow">切换原因（必填）
              <input value={conventionReason} onChange={(event) => setConventionReason(event.currentTarget.value)} maxLength={2000} />
            </label>
            <button disabled={busy} onClick={() => void switchConvention()}>切换口径</button>
          </div>
          <ErrorBox cause={conventions.error} />
        </Card>
      )}

      <Card title="面积与口径">
        <div className="form-grid">
          <label>土地面积（sqft）
            <input inputMode="decimal" disabled={!canEdit} value={draft.areaBasis.landAreaSqft} onChange={(event) => patchArea({ landAreaSqft: event.currentTarget.value })} />
          </label>
          <label>容积率/密度
            <input inputMode="decimal" disabled={!canEdit} value={draft.areaBasis.plotRatioOrDensity} onChange={(event) => patchArea({ plotRatioOrDensity: event.currentTarget.value })} />
          </label>
          <label>密度口径
            <select disabled={!canEdit} value={draft.areaBasis.densityBasis} onChange={(event) => patchArea({ densityBasis: event.currentTarget.value as PlanInputs['areaBasis']['densityBasis'] })}>
              {Object.entries(DENSITY_BASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>NFA 效率模式
            <select disabled={!canEdit} value={draft.areaBasis.nfaMode} onChange={(event) => patchArea({ nfaMode: event.currentTarget.value as PlanInputs['areaBasis']['nfaMode'] })}>
              {Object.entries(NFA_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {draft.areaBasis.nfaMode === 'manual' && (
            <label>手工效率（如 0.85）
              <input inputMode="decimal" disabled={!canEdit} value={draft.areaBasis.manualEfficiency ?? ''} onChange={(event) => patchArea({ manualEfficiency: event.currentTarget.value })} />
            </label>
          )}
          <label>GFA 是否含车位
            <input type="checkbox" disabled={!canEdit} checked={draft.areaBasis.gfaIncludesParking} onChange={(event) => patchArea({ gfaIncludesParking: event.currentTarget.checked })} />
          </label>
        </div>
        <KeyValue
          rows={[
            ['面积口径版本', draft.areaBasis.areaConventionId ?? '—（正式化前必须引用口径版本）'],
            ['口径切换原因', draft.areaBasis.areaConventionReason ?? '—'],
          ]}
        />
      </Card>

      <Card title="地价（D4 双向录入）">
        <p className="hint">编辑任一侧即以该侧为计算基准，服务端换算另一侧；正式化前至少一侧有值。</p>
        <div className="form-grid">
          <label>土地总价
            <input inputMode="decimal" disabled={!canEdit} value={draft.landPrice.total ?? ''} onChange={(event) => patchLandPrice({ total: event.currentTarget.value, lastEditedBasis: 'total' })} />
          </label>
          <label>单价（/sqft）
            <input inputMode="decimal" disabled={!canEdit} value={draft.landPrice.perSqft ?? ''} onChange={(event) => patchLandPrice({ perSqft: event.currentTarget.value, lastEditedBasis: 'per-sqft' })} />
          </label>
        </div>
        <div className="row-actions" style={{ marginTop: '0.5rem' }}>
          <Badge tone="info">计算基准：{LAND_BASIS_LABELS[draft.landPrice.lastEditedBasis] ?? draft.landPrice.lastEditedBasis}</Badge>
        </div>
      </Card>

      <Card title="车位">
        <div className="form-grid">
          <label>政府最低车位<input type="number" disabled={!canEdit} value={draft.parking.govMin} onChange={(event) => patchParking({ govMin: numberOrZero(event) })} /></label>
          <label>内部目标车位<input type="number" disabled={!canEdit} value={draft.parking.internalTarget} onChange={(event) => patchParking({ internalTarget: numberOrZero(event) })} /></label>
          <label>采用组
            <select disabled={!canEdit} value={draft.parking.usedBasis} onChange={(event) => patchParking({ usedBasis: event.currentTarget.value as PlanInputs['parking']['usedBasis'] })}>
              {Object.entries(PARKING_USED_BASIS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>访客车位（可空）<input type="number" disabled={!canEdit} value={draft.parking.visitorSlots ?? ''} onChange={(event) => patchParking({ visitorSlots: optionalNumber(event) })} /></label>
          <label>额外内部车位（可空）<input type="number" disabled={!canEdit} value={draft.parking.extraInternalSlots ?? ''} onChange={(event) => patchParking({ extraInternalSlots: optionalNumber(event) })} /></label>
          <label>每车位面积（sqft）<input inputMode="decimal" disabled={!canEdit} value={draft.parking.areaPerSlotSqft} onChange={(event) => patchParking({ areaPerSlotSqft: event.currentTarget.value })} /></label>
        </div>
        <p className="hint">产品车位需求之和不得低于采用组数值（服务端校验）。</p>
      </Card>

      <Card title={`期次与产品（${draft.phases.length} 期）`}>
        {draft.phases.length === 0 && <EmptyState text="暂无期次。" />}
        {draft.phases.map((phase, phaseIndex) => (
          <div className="block" key={phase.id}>
            <div className="form-grid">
              <label>期次名称
                <input disabled={!canEdit} value={phase.name} onChange={(event) => patchPhase(phaseIndex, { name: event.currentTarget.value })} />
              </label>
              <label>土地分摊方式
                <select disabled={!canEdit} value={phase.landAllocation.method} onChange={(event) => patchPhase(phaseIndex, { landAllocation: { ...phase.landAllocation, method: event.currentTarget.value as PlanInputs['phases'][number]['landAllocation']['method'] } })}>
                  {LAND_ALLOCATION_METHODS.map((value) => <option key={value} value={value}>{LAND_ALLOCATION_LABELS[value]}</option>)}
                </select>
              </label>
              {phase.landAllocation.method === 'manual' && (
                <label>手动分摊值
                  <input inputMode="decimal" disabled={!canEdit} value={phase.landAllocation.value ?? ''} onChange={(event) => patchPhase(phaseIndex, { landAllocation: { ...phase.landAllocation, value: event.currentTarget.value } })} />
                </label>
              )}
              <label className="span-2">GFA 分摊（JSON，键为用途、值为面积）
                <textarea disabled={!canEdit} value={phase.gfaBreakdownText} onChange={(event) => patchPhase(phaseIndex, { gfaBreakdownText: event.currentTarget.value })} placeholder='{"total": "250000"}' />
              </label>
            </div>
            {phase.products.length > 0 && <h4>产品（{phase.products.length}）</h4>}
            {phase.products.map((product, productIndex) => (
              <div className="block" key={product.id}>
                <div className="form-grid">
                  <label>业态
                    <select disabled={!canEdit} value={product.format} onChange={(event) => patchProduct(phaseIndex, productIndex, { format: event.currentTarget.value as PlanProductInput['format'] })}>
                      {PRODUCT_FORMATS.map((value) => <option key={value} value={value}>{FORMAT_LABELS[value]}</option>)}
                    </select>
                  </label>
                  <label>档次/户型<input disabled={!canEdit} value={product.tier ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { tier: event.currentTarget.value })} /></label>
                  <label>份额（%）<input inputMode="decimal" disabled={!canEdit} value={product.sharePct} onChange={(event) => patchProduct(phaseIndex, productIndex, { sharePct: event.currentTarget.value })} /></label>
                  <label>单位数<input type="number" disabled={!canEdit} value={product.units} onChange={(event) => patchProduct(phaseIndex, productIndex, { units: numberOrZero(event) })} /></label>
                  <label>单位面积（sqft）<input inputMode="decimal" disabled={!canEdit} value={product.unitAreaSqft} onChange={(event) => patchProduct(phaseIndex, productIndex, { unitAreaSqft: event.currentTarget.value })} /></label>
                  <label>可售面积（sqft）<input inputMode="decimal" disabled={!canEdit} value={product.saleableAreaSqft} onChange={(event) => patchProduct(phaseIndex, productIndex, { saleableAreaSqft: event.currentTarget.value })} /></label>
                  <label>计价基准
                    <select disabled={!canEdit} value={product.priceBasis} onChange={(event) => patchProduct(phaseIndex, productIndex, { priceBasis: event.currentTarget.value as PlanProductInput['priceBasis'] })}>
                      {Object.entries(PRICE_BASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  {product.priceBasis !== 'per-sqft' && (
                    <label>单位总价<input inputMode="decimal" disabled={!canEdit} value={product.price ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { price: event.currentTarget.value })} /></label>
                  )}
                  {product.priceBasis === 'per-sqft' && (
                    <label>每 sqft 单价<input inputMode="decimal" disabled={!canEdit} value={product.pricePerSqft ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { pricePerSqft: event.currentTarget.value })} /></label>
                  )}
                  <label>Bumi 配额（%）<input inputMode="decimal" disabled={!canEdit} value={product.bumiQuotaPct ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { bumiQuotaPct: event.currentTarget.value })} /></label>
                  <label>Bumi 折扣（%）<input inputMode="decimal" disabled={!canEdit} value={product.bumiDiscountPct ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { bumiDiscountPct: event.currentTarget.value })} /></label>
                  <label>可负担套数<input type="number" disabled={!canEdit} value={product.affordableQuota?.units ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { affordableQuota: { ...(product.affordableQuota ?? {}), units: numberOrZero(event) } })} /></label>
                  <label>可负担单价<input inputMode="decimal" disabled={!canEdit} value={product.affordableQuota?.price ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { affordableQuota: { ...(product.affordableQuota ?? {}), price: event.currentTarget.value } })} /></label>
                  <label>每单位车位<input inputMode="decimal" disabled={!canEdit} value={product.parkingPerUnit ?? ''} onChange={(event) => patchProduct(phaseIndex, productIndex, { parkingPerUnit: event.currentTarget.value })} /></label>
                </div>
                {canEdit && (
                  <div className="row-actions">
                    <button className="secondary" onClick={() => removeProduct(phaseIndex, productIndex)}>删除产品</button>
                  </div>
                )}
              </div>
            ))}
            <div className="row-actions">
              {canEdit && <button className="secondary" onClick={() => addProduct(phaseIndex)}>添加产品</button>}
              {canEdit && <button className="secondary" onClick={() => removePhase(phaseIndex)}>删除期次</button>}
              <span className="hint">份额合计须为 100；单位数 × 单位面积须等于可售面积（服务端校验）。</span>
            </div>
          </div>
        ))}
        {canEdit && <button className="secondary" onClick={addPhase}>添加期次</button>}
      </Card>

      <Card title={`成本项（${draft.costs.length}）`}>
        <p className="hint">成本按九类归集；状态为“待确认”的费用项不纳入确定性结论（看板会提示）。</p>
        {draft.costs.length === 0 && <EmptyState text="暂无成本项。" />}
        {draft.costs.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>期次</th><th>类别</th><th>名称</th><th>计算基准</th><th>数值</th><th>来源类型</th><th>状态</th><th>备注</th><th></th></tr></thead>
              <tbody>
                {draft.costs.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <select disabled={!canEdit} value={item.phaseId ?? ''} onChange={(event) => patchCost(index, { phaseId: event.currentTarget.value === '' ? null : event.currentTarget.value })}>
                        <option value="">不挂期次</option>
                        {draft.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select disabled={!canEdit} value={item.category} onChange={(event) => patchCost(index, { category: event.currentTarget.value as PlanInputs['costs'][number]['category'] })}>
                        {COST_CATEGORIES.map((value) => <option key={value} value={value}>{COST_CATEGORY_LABELS[value]}</option>)}
                      </select>
                    </td>
                    <td><input disabled={!canEdit} value={item.itemName} onChange={(event) => patchCost(index, { itemName: event.currentTarget.value })} /></td>
                    <td>
                      <select disabled={!canEdit} value={item.basis} onChange={(event) => patchCost(index, { basis: event.currentTarget.value as PlanInputs['costs'][number]['basis'] })}>
                        {COST_BASES.map((value) => <option key={value} value={value}>{COST_BASIS_LABELS[value]}</option>)}
                      </select>
                    </td>
                    <td><input inputMode="decimal" disabled={!canEdit} value={item.value} onChange={(event) => patchCost(index, { value: event.currentTarget.value })} /></td>
                    <td>
                      <select disabled={!canEdit} value={item.sourceType} onChange={(event) => patchCost(index, { sourceType: event.currentTarget.value as PlanInputs['costs'][number]['sourceType'] })}>
                        {SOURCE_TYPE_KEYS.map((value) => <option key={value} value={value}>{SOURCE_TYPE_LABELS[value]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select disabled={!canEdit} value={item.status} onChange={(event) => patchCost(index, { status: event.currentTarget.value as PlanInputs['costs'][number]['status'] })}>
                        {Object.entries(COST_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td><input disabled={!canEdit} value={item.note ?? ''} onChange={(event) => patchCost(index, { note: event.currentTarget.value })} /></td>
                    <td>{canEdit && <button className="secondary" onClick={() => removeCost(index)}>删除</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && (
          <div className="row-actions" style={{ marginTop: '0.5rem' }}>
            <button className="secondary" onClick={addCost}>添加成本项</button>
          </div>
        )}
      </Card>

      <Card title={`公共成本分摊（${draft.commonPools.length}）`}>
        <p className="hint">公共池成本按所选基准分摊到各期次；自定义比例需按期次 ID 提供比例 JSON（合计 100）。</p>
        {draft.commonPools.length === 0 && <EmptyState text="暂无公共成本池。" />}
        {draft.commonPools.map((pool, index) => (
          <div className="block" key={pool.id}>
            <div className="form-grid">
              <label>类别
                <select disabled={!canEdit} value={pool.category} onChange={(event) => patchPool(index, { category: event.currentTarget.value as PlanInputs['commonPools'][number]['category'] })}>
                  {COST_CATEGORIES.map((value) => <option key={value} value={value}>{COST_CATEGORY_LABELS[value]}</option>)}
                </select>
              </label>
              <label>金额<input inputMode="decimal" disabled={!canEdit} value={pool.amount} onChange={(event) => patchPool(index, { amount: event.currentTarget.value })} /></label>
              <label>分摊基准
                <select disabled={!canEdit} value={pool.allocationBasis} onChange={(event) => patchPool(index, { allocationBasis: event.currentTarget.value as PlanInputs['commonPools'][number]['allocationBasis'] })}>
                  {ALLOCATION_BASES.map((value) => <option key={value} value={value}>{ALLOCATION_BASIS_LABELS[value]}</option>)}
                </select>
              </label>
              {pool.allocationBasis === 'custom-ratio' && (
                <label className="span-2">按期次比例 JSON
                  <textarea
                    disabled={!canEdit}
                    value={pool.ratiosText}
                    onChange={(event) => patchPool(index, { ratiosText: event.currentTarget.value })}
                    placeholder={draft.phases.length > 0 ? JSON.stringify(Object.fromEntries(draft.phases.slice(0, 2).map((phase) => [phase.id, '50']))) : undefined}
                  />
                </label>
              )}
              <label className="span-2">规则说明<input disabled={!canEdit} value={pool.ruleNote ?? ''} onChange={(event) => patchPool(index, { ruleNote: event.currentTarget.value })} /></label>
            </div>
            {canEdit && <button className="secondary" onClick={() => removePool(index)}>删除</button>}
          </div>
        ))}
        {canEdit && <button className="secondary" onClick={addPool}>添加公共池</button>}
      </Card>

      <Card title="测算结果">
        {data.results !== null ? <PlanResultsView results={data.results} /> : <EmptyState text="暂无测算结果：保存输入后服务端自动重算。" />}
      </Card>

      {can('plans:read') && <PlanAnalysisPanel planId={planId} />}

      <AiSuggestionPanel
        parcelId={parcel.id}
        kind="plan-adjustment"
        targetPlanId={planId}
        canGenerate={can('plans:read')}
        canConfirm={can('plans:write')}
        promptPlaceholder="如：在保持 PM≥18% 的前提下提升可负担产品占比"
        onConfirmed={(result) => {
          if (result.derivedPlan) {
            reloadList()
            selectPlan(result.derivedPlan.id)
          }
        }}
      />
    </div>
  )
}
