import { useEffect, useMemo, useState } from 'react'
import { validateDiscountIntervals, type DiscountRulePayload } from '../../../shared/contracts'
import { Alert, Modal } from '../../components/ui'
import { InputField, SelectField } from '../../components/form'
import { numberToText } from '../../platform/format'
import { DISCOUNT_MODE_LABELS } from '../../labels'

// 分段优惠弹窗：选中单条费用明细行配置优惠区间；区间约束（下限≥0、上限>下限、不重叠、无断层）。
interface DiscountDraft {
  lowerLimit: string
  upperLimit: string
  discountMode: string
  percentValue: string
  fixedValue: string
}

const EMPTY_DRAFT: DiscountDraft = { lowerLimit: '', upperLimit: '', discountMode: 'percent', percentValue: '', fixedValue: '' }

export function discountsToDrafts(rules: DiscountRulePayload[] | undefined): DiscountDraft[] {
  return (rules ?? []).map((rule) => ({
    lowerLimit: numberToText(rule.lowerLimit),
    upperLimit: numberToText(rule.upperLimit),
    discountMode: rule.discountMode,
    percentValue: numberToText(rule.percentValue ?? null),
    fixedValue: rule.fixedValue === null || rule.fixedValue === undefined ? '' : (rule.fixedValue / 100).toFixed(2),
  }))
}

export function parseDiscountDrafts(drafts: DiscountDraft[]): { rules: DiscountRulePayload[] } | { error: string } {
  const rules: DiscountRulePayload[] = []
  for (const [index, draft] of drafts.entries()) {
    const lineLabel = `第 ${index + 1} 行`
    const lowerText = draft.lowerLimit.trim()
    if (!lowerText) return { error: `${lineLabel}业务量下限为必填项` }
    if (!/^\d+(\.\d{1,2})?$/.test(lowerText)) return { error: `${lineLabel}业务量下限须为非负数字，最多 2 位小数` }
    const upperText = draft.upperLimit.trim()
    if (!upperText) return { error: `${lineLabel}业务量上限为必填项` }
    if (!/^\d+(\.\d{1,2})?$/.test(upperText)) return { error: `${lineLabel}业务量上限须为非负数字，最多 2 位小数` }
    const lower = parseFloat(lowerText)
    const upper = parseFloat(upperText)
    if (!(upper > lower)) return { error: `${lineLabel}业务量上限必须大于业务量下限` }
    if (draft.discountMode !== 'percent' && draft.discountMode !== 'fixed') return { error: `${lineLabel}优惠方式为必填项` }
    if (draft.discountMode === 'percent') {
      const percentText = draft.percentValue.trim()
      if (!percentText) return { error: `${lineLabel}优惠百分比为必填项` }
      if (!/^\d+(\.\d{1,2})?$/.test(percentText)) return { error: `${lineLabel}优惠百分比须为 0~100 的数值` }
      const percent = parseFloat(percentText)
      if (percent > 100) return { error: `${lineLabel}优惠百分比不可超过 100` }
      rules.push({ lowerLimit: lower, upperLimit: upper, discountMode: 'percent', percentValue: percent, fixedValue: null })
    } else {
      const fixedText = draft.fixedValue.trim()
      if (!fixedText) return { error: `${lineLabel}固定金额为必填项` }
      if (!/^\d+(\.\d{1,2})?$/.test(fixedText)) return { error: `${lineLabel}固定金额须为非负数字，最多 2 位小数` }
      rules.push({ lowerLimit: lower, upperLimit: upper, discountMode: 'fixed', percentValue: null, fixedValue: Math.round(parseFloat(fixedText) * 100) })
    }
  }
  const intervalError = validateDiscountIntervals(rules)
  if (intervalError) return { error: `分段优惠区间禁止交叉或断层：${intervalError}，请调整业务量区间` }
  return { rules }
}

// 详情只读展示优惠规则
export function DiscountRulesView({ rules }: { rules: DiscountRulePayload[] | undefined }) {
  if (!rules || rules.length === 0) return <span className="muted">未配置</span>
  return (
    <span>
      {rules.map((rule, index) => (
        <span key={index}>
          {index > 0 && '；'}
          [{rule.lowerLimit}, {rule.upperLimit}){' '}
          {rule.discountMode === 'percent' ? `${rule.percentValue}%` : `${((rule.fixedValue ?? 0) / 100).toFixed(2)} 元`}
        </span>
      ))}
    </span>
  )
}

export default function DiscountModal({ open, feeTypeName, initialRules, readOnly, onClose, onSave }: {
  open: boolean
  feeTypeName: string
  initialRules: DiscountRulePayload[] | undefined
  readOnly?: boolean
  onClose: () => void
  onSave?: (rules: DiscountRulePayload[]) => void
}) {
  const [drafts, setDrafts] = useState<DiscountDraft[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setDrafts(discountsToDrafts(initialRules))
      setError('')
    }
  }, [open, initialRules])

  const update = (index: number, patch: Partial<DiscountDraft>) => {
    setDrafts((current) => current.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)))
  }

  const footer = useMemo(() => {
    if (readOnly) return <button type="button" className="btn btn-secondary" onClick={onClose}>关闭</button>
    return (
      <>
        <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
        <button type="button" className="btn" onClick={() => {
          const result = parseDiscountDrafts(drafts)
          if ('error' in result) {
            setError(result.error)
            return
          }
          onSave?.(result.rules)
        }}>保存优惠规则</button>
      </>
    )
  }, [readOnly, onClose, onSave, drafts])

  return (
    <Modal open={open} title={`分段优惠 · ${feeTypeName}`} onClose={onClose} width={720} footer={footer}>
      <p className="field-hint" style={{ margin: '0 0 12px' }}>
        优惠规则仅对当前费用类型生效；各区间不可重叠、不可断层（按业务量下限升序首尾相接）。
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      {drafts.length === 0 && !readOnly && (
        <Alert kind="info">尚未配置分段优惠。点击「新增优惠区间」添加；不配置则不参与优惠计算。</Alert>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>业务量下限</th>
              <th>业务量上限</th>
              <th>优惠方式</th>
              <th>优惠百分比</th>
              <th>固定金额（元）</th>
              {!readOnly && <th style={{ width: 70 }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft, index) => (
              <tr key={index}>
                <td>
                  <input className="input" style={{ minWidth: 90 }} value={draft.lowerLimit} disabled={readOnly} inputMode="decimal" placeholder="0" onChange={(event) => update(index, { lowerLimit: event.currentTarget.value })} />
                </td>
                <td>
                  <input className="input" style={{ minWidth: 90 }} value={draft.upperLimit} disabled={readOnly} inputMode="decimal" onChange={(event) => update(index, { upperLimit: event.currentTarget.value })} />
                </td>
                <td>
                  <select className="select" style={{ minWidth: 110 }} value={draft.discountMode} disabled={readOnly} onChange={(event) => update(index, { discountMode: event.currentTarget.value })}>
                    <option value="percent">{DISCOUNT_MODE_LABELS.percent}</option>
                    <option value="fixed">{DISCOUNT_MODE_LABELS.fixed}</option>
                  </select>
                </td>
                <td>
                  <input className="input" style={{ minWidth: 90 }} value={draft.discountMode === 'percent' ? draft.percentValue : ''} disabled={readOnly || draft.discountMode !== 'percent'} inputMode="decimal" placeholder="0~100" onChange={(event) => update(index, { percentValue: event.currentTarget.value })} />
                </td>
                <td>
                  <input className="input" style={{ minWidth: 100 }} value={draft.discountMode === 'fixed' ? draft.fixedValue : ''} disabled={readOnly || draft.discountMode !== 'fixed'} inputMode="decimal" placeholder="0.00" onChange={(event) => update(index, { fixedValue: event.currentTarget.value })} />
                </td>
                {!readOnly && (
                  <td>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setDrafts((current) => current.filter((_, position) => position !== index))}>删除</button>
                  </td>
                )}
              </tr>
            ))}
            {drafts.length === 0 && readOnly && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>未配置分段优惠</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDrafts((current) => [...current, { ...EMPTY_DRAFT }])}>新增优惠区间</button>
        </div>
      )}
    </Modal>
  )
}
