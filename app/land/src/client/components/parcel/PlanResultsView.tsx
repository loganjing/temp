import { KeyValue } from '../ui'
import {
  COST_CATEGORY_LABELS, FORMAT_LABELS, SOURCE_TYPE_LABELS,
  displayDateTime, displayMoney, displayNumber, displayPercent,
} from '../../lib/format'
import type { PlanResults } from '../../types'

const LAND_BASIS_LABELS: Record<string, string> = { total: '总价', 'per-sqft': '单价/sqft' }
const COST_STATUS_LABELS: Record<string, string> = { confirmed: '已确认', zero: '为零', pending: '待确认' }

/** 方案测算结果只读视图（服务端计算权威，前端只展示，不实现公式）。 */
export default function PlanResultsView({ results }: { results: PlanResults }) {
  return (
    <div className="stack">
      <div className="summary-grid">
        <div className="metric-card"><div className="metric-label">GDV 总销售收入</div><div className="metric-value">{displayMoney(results.revenue.gdv)}</div></div>
        <div className="metric-card"><div className="metric-label">净 GDV</div><div className="metric-value">{displayMoney(results.revenue.netGdv)}</div></div>
        <div className="metric-card"><div className="metric-label">TDC 总开发成本</div><div className="metric-value">{displayMoney(results.costs.tdc)}</div></div>
        <div className="metric-card"><div className="metric-label">税前利润 PBT</div><div className={`metric-value${Number(results.profit.pbt) < 0 ? ' negative' : ''}`}>{displayMoney(results.profit.pbt)}</div></div>
        <div className="metric-card"><div className="metric-label">利润率 PM</div><div className={`metric-value${Number(results.profit.pm) < 0 ? ' negative' : ''}`}>{displayPercent(results.profit.pm)}</div></div>
      </div>

      <KeyValue
        rows={[
          ['GFA 总面积', displayNumber(results.gfaTotal)],
          ['GFA（不含车位）', displayNumber(results.gfaExParking)],
          ['NFA 净可售面积', displayNumber(results.nfaTotal)],
          ['效率（不含车位）', displayPercent(results.efficiencyExParking)],
          ['效率（含车位）', displayPercent(results.efficiencyInclParking)],
          ['总单位数', displayNumber(results.totalUnits)],
          ['每英亩单位数', displayNumber(results.unitsPerAcre)],
          ['Bumi 折扣', displayMoney(results.revenue.bumiQuotaDiscount)],
          ['车位收入', displayMoney(results.revenue.parkingRevenue)],
          ['其他可售收入', displayMoney(results.revenue.otherSaleableRevenue)],
          ['计算时间', displayDateTime(results.computedAt)],
          ['面积口径', results.basis.areaConventionId ?? '—'],
          ['地价基准', LAND_BASIS_LABELS[results.basis.landPriceBasis ?? ''] ?? results.basis.landPriceBasis ?? '—'],
        ]}
      />

      {results.revenue.byProduct.length > 0 && (
        <div>
          <h4>分产品收入</h4>
          <div className="table-scroll">
            <table>
              <thead><tr><th>产品</th><th className="num">收入</th><th className="num">Bumi 调整</th></tr></thead>
              <tbody>
                {results.revenue.byProduct.map((item) => (
                  <tr key={item.productId}>
                    <td>{FORMAT_LABELS[item.format] ?? item.format}<span className="subtext">{item.productId}</span></td>
                    <td className="num">{displayMoney(item.revenue)}</td>
                    <td className="num">{displayMoney(item.bumiAdjustment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h4>成本归集（九类）</h4>
        {results.costs.byCategory.length === 0 ? (
          <p className="hint">无成本行。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>类别</th><th className="num">金额</th><th>明细</th></tr></thead>
              <tbody>
                {results.costs.byCategory.map((entry) => (
                  <tr key={entry.category}>
                    <td>{COST_CATEGORY_LABELS[entry.category] ?? entry.category}</td>
                    <td className="num">{displayMoney(entry.amount)}</td>
                    <td>
                      {entry.items.length === 0 ? '—' : (
                        <details className="expander">
                          <summary>{entry.items.length} 项明细</summary>
                          <div className="table-scroll">
                            <table>
                              <thead><tr><th>费用项</th><th className="num">金额</th><th>来源类型</th><th>状态</th></tr></thead>
                              <tbody>
                                {entry.items.map((item) => (
                                  <tr key={item.costItemId}>
                                    <td>{item.itemName}</td>
                                    <td className="num">{displayMoney(item.amount)}</td>
                                    <td>{SOURCE_TYPE_LABELS[item.sourceType] ?? item.sourceType}</td>
                                    <td>{COST_STATUS_LABELS[item.status] ?? item.status}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {results.costs.commonPoolAllocations.length > 0 && (
        <div>
          <h4>公共成本分摊</h4>
          <div className="table-scroll">
            <table>
              <thead><tr><th>公共池</th><th>期次</th><th className="num">分摊金额</th><th>基准</th></tr></thead>
              <tbody>
                {results.costs.commonPoolAllocations.map((entry, index) => (
                  <tr key={`${entry.poolId}-${entry.phaseId}-${index}`}>
                    <td>{entry.poolId}</td>
                    <td>{entry.phaseId}</td>
                    <td className="num">{displayMoney(entry.amount)}</td>
                    <td>{entry.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h4>单位指标</h4>
        <KeyValue
          rows={[
            ['单位 GDV', displayMoney(results.profit.perUnit.gdv)],
            ['单位净 GDV', displayMoney(results.profit.perUnit.netGdv)],
            ['单位 TDC', displayMoney(results.profit.perUnit.tdc)],
            ['单位 PBT', displayMoney(results.profit.perUnit.pbt)],
            ['每 sqft GDV', displayMoney(results.profit.perSqft.gdv)],
            ['每 sqft TDC', displayMoney(results.profit.perSqft.tdc)],
            ['每 sqft PBT', displayMoney(results.profit.perSqft.pbt)],
            ['每英亩 GDV', displayMoney(results.profit.perAcre.gdv)],
            ['每英亩 TDC', displayMoney(results.profit.perAcre.tdc)],
          ]}
        />
      </div>
    </div>
  )
}
