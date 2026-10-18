import { useState, type FormEvent } from 'react'
import { Card, EmptyState, ErrorBox, KeyValue, StatusBadge, statusTone } from '../ui'
import { BACK_SOLVE_LABELS, SENSITIVITY_VARIABLE_LABELS, displayMoney, displayPercent, displayPercentValue } from '../../lib/format'
import { apiRequest, errorText } from '../../platform/api-client'
import type { BackSolveResponse, SensitivityResponse } from '../../types'

const VARIABLES = Object.keys(SENSITIVITY_VARIABLE_LABELS)
const SOLVE_TARGETS = Object.keys(BACK_SOLVE_LABELS)
const FEASIBILITY_LABELS: Record<string, string> = { feasible: '可行', marginal: '边际', infeasible: '不可行' }

const parseValues = (text: string): string[] =>
  text.split(/[,，\s]+/).map((value) => value.trim()).filter((value) => value !== '')

/** 敏感性矩阵与目标利润率反算（服务端现场计算，不落权威数据；每格全链重算）。 */
export default function PlanAnalysisPanel({ planId }: { planId: string }) {
  const [variable1, setVariable1] = useState('land-price')
  const [values1, setValues1] = useState('0.9, 1, 1.1')
  const [variable2, setVariable2] = useState('')
  const [values2, setValues2] = useState('')
  const [targetPm, setTargetPm] = useState('18')
  const [sensitivity, setSensitivity] = useState<SensitivityResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [solveFor, setSolveFor] = useState('max-land-price')
  const [solveTargetPm, setSolveTargetPm] = useState('18')
  const [backSolve, setBackSolve] = useState<BackSolveResponse | null>(null)
  const [solveError, setSolveError] = useState('')

  const runSensitivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const dimensions: Array<{ variable: string; values: string[] }> = [{ variable: variable1, values: parseValues(values1) }]
    if (variable2) dimensions.push({ variable: variable2, values: parseValues(values2) })
    if (dimensions.some((dimension) => dimension.values.length === 0)) {
      setError('请为每个维度填写至少一个取值。')
      return
    }
    setBusy(true)
    setSensitivity(null)
    try {
      setSensitivity(
        await apiRequest<SensitivityResponse>(`/api/plans/${encodeURIComponent(planId)}/sensitivity`, {
          method: 'POST',
          body: JSON.stringify({ dimensions, ...(targetPm.trim() === '' ? {} : { targetPm: targetPm.trim() }) }),
        }),
      )
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const runBackSolve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSolveError('')
    if (solveTargetPm.trim() === '') {
      setSolveError('请填写目标利润率。')
      return
    }
    setBusy(true)
    setBackSolve(null)
    try {
      setBackSolve(
        await apiRequest<BackSolveResponse>(`/api/plans/${encodeURIComponent(planId)}/back-solve`, {
          method: 'POST',
          body: JSON.stringify({ targetPm: solveTargetPm.trim(), solveFor }),
        }),
      )
    } catch (cause) {
      setSolveError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const twoDim = sensitivity !== null && sensitivity.matrix.some((cell) => cell.coord.length === 2)
  const secondValues = sensitivity ? [...new Set(sensitivity.matrix.map((cell) => cell.coord[1] ?? ''))] : []
  const firstValues = sensitivity ? [...new Set(sensitivity.matrix.map((cell) => cell.coord[0]))] : []
  const cellAt = (first: string, second: string) =>
    sensitivity?.matrix.find((cell) => cell.coord[0] === first && (cell.coord[1] ?? '') === second)

  return (
    <div className="stack">
      <Card title="敏感性矩阵">
        <p className="hint">维度取值为相对因子（1 = 当前值）；1–2 个维度，服务端对每个组合全链重算。</p>
        <form className="form-grid" onSubmit={(event) => void runSensitivity(event)}>
          <label>维度一
            <select value={variable1} onChange={(event) => setVariable1(event.currentTarget.value)}>
              {VARIABLES.map((value) => <option key={value} value={value}>{SENSITIVITY_VARIABLE_LABELS[value]}</option>)}
            </select>
          </label>
          <label>维度一取值（逗号分隔）<input inputMode="decimal" value={values1} onChange={(event) => setValues1(event.currentTarget.value)} placeholder="0.9, 1, 1.1" /></label>
          <label>维度二（可选）
            <select value={variable2} onChange={(event) => setVariable2(event.currentTarget.value)}>
              <option value="">不启用</option>
              {VARIABLES.filter((value) => value !== variable1).map((value) => <option key={value} value={value}>{SENSITIVITY_VARIABLE_LABELS[value]}</option>)}
            </select>
          </label>
          {variable2 && (
            <label>维度二取值（逗号分隔）<input inputMode="decimal" value={values2} onChange={(event) => setValues2(event.currentTarget.value)} placeholder="0.9, 1, 1.1" /></label>
          )}
          <label>目标利润率（百分数，如 18）<input inputMode="decimal" value={targetPm} onChange={(event) => setTargetPm(event.currentTarget.value)} /></label>
          <button disabled={busy}>{busy ? '计算中…' : '生成矩阵'}</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
        {sensitivity && (
          <div className="stack">
            {sensitivity.matrix.length === 0 ? (
              <EmptyState text="无组合结果。" />
            ) : twoDim ? (
              <div className="table-scroll">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th>{SENSITIVITY_VARIABLE_LABELS[variable1] ?? variable1} × {SENSITIVITY_VARIABLE_LABELS[variable2] ?? variable2}</th>
                      {secondValues.map((value) => <th key={value} className="num">{value}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {firstValues.map((first) => (
                      <tr key={first}>
                        <th scope="row">{first}</th>
                        {secondValues.map((second) => {
                          const cell = cellAt(first, second)
                          return (
                            <td key={second} className={cell ? `cell-${statusTone(cell.feasibility)}` : ''} title={cell?.riskNote ?? ''}>
                              {cell ? displayPercent(cell.pm) : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="matrix-table">
                  <thead>
                    <tr><th>{SENSITIVITY_VARIABLE_LABELS[variable1] ?? variable1} 因子</th><th className="num">PM</th><th className="num">PBT</th><th className="num">TDC</th><th className="num">净 GDV</th><th>可行性</th><th>风险说明</th></tr>
                  </thead>
                  <tbody>
                    {sensitivity.matrix.map((cell) => (
                      <tr key={cell.coord.join('|')}>
                        <td className="num">{cell.coord[0]}</td>
                        <td className={`num cell-${statusTone(cell.feasibility)}`}>{displayPercent(cell.pm)}</td>
                        <td className="num">{displayMoney(cell.pbt)}</td>
                        <td className="num">{displayMoney(cell.tdc)}</td>
                        <td className="num">{displayMoney(cell.netGdv)}</td>
                        <td><StatusBadge status={cell.feasibility} label={FEASIBILITY_LABELS[cell.feasibility]} /></td>
                        <td className="matrix-note">{cell.riskNote ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sensitivity.colorRuleApplied && (
              <p className="matrix-note">
                目标线 {displayPercent(sensitivity.colorRuleApplied.targetLine)}；配色：绿=ok、黄=warning、红=danger（按 zones 规则）。
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="目标利润率反算">
        <p className="hint">给定目标 PM，反算土地/售价/建筑成本的可承受临界值（结果为全精度 decimal 字符串）。</p>
        <form className="form-grid" onSubmit={(event) => void runBackSolve(event)}>
          <label>求解目标
            <select value={solveFor} onChange={(event) => setSolveFor(event.currentTarget.value)}>
              {SOLVE_TARGETS.map((value) => <option key={value} value={value}>{BACK_SOLVE_LABELS[value]}</option>)}
            </select>
          </label>
          <label>目标利润率（百分数，如 18）<input inputMode="decimal" value={solveTargetPm} onChange={(event) => setSolveTargetPm(event.currentTarget.value)} /></label>
          <button disabled={busy}>{busy ? '反算中…' : '反算'}</button>
        </form>
        {solveError && <p role="alert" className="error">{solveError}</p>}
        {backSolve && (
          <KeyValue
            rows={[
              ['求解目标', BACK_SOLVE_LABELS[backSolve.solveFor] ?? backSolve.solveFor],
              ['目标利润率', displayPercentValue(backSolve.targetPm)],
              ['结果值', displayMoney(backSolve.resultValue)],
              ['口径说明', backSolve.basisNote],
            ]}
          />
        )}
      </Card>
    </div>
  )
}
