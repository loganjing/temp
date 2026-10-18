import type { DbClient } from '@commonapp/dbkit'
import type { BillingMeasure } from './billing-engine'

// MeasureProvider 策略点（架构基线第 7 节未决事项承载）：
// 按天（前一日库存）与按月（月度口径）分别实现度量取值，计算管道不因口径变化改动。
//
// 策略选择（实现前固定）：系统未提供历史库存表，inventory 为当前库存事实表；
// - daily：任务执行时点快照即「前一日库存」（每日 00:00 于前一日结算后执行）；
// - monthly：月度业务量口径取任务执行时点的库存快照聚合值（月初与月末库存同一快照）。

export interface MeasureRequest {
  warehouseId: string
  ownerId: string
  goodsCategoryId: string | null
}

export interface MeasureProvider {
  readonly name: 'daily' | 'monthly'
  // 返回 null 表示该仓库/货主无任何库存记录（库存数据缺失）
  getMeasure(db: DbClient, request: MeasureRequest): Promise<BillingMeasure | null>
}

const AGGREGATE_SQL = `
SELECT
  COALESCE(SUM(i.quantity), 0) AS stock_qty,
  COALESCE(SUM(i.occupied_locations), 0) AS locations,
  COALESCE(SUM(i.quantity * g.unit_volume), 0) AS volume,
  COALESCE(SUM(i.quantity * g.unit_gross_weight), 0) AS weight,
  COUNT(*) AS row_count
FROM inventory i
JOIN goods g ON g.id = i.goods_id
WHERE i.warehouse_id = ? AND i.owner_id = ?`

const SCOPED_COUNT_SQL = 'SELECT COUNT(*) AS total FROM inventory WHERE warehouse_id = ? AND owner_id = ?'

async function aggregate(db: DbClient, request: MeasureRequest): Promise<BillingMeasure | null> {
  const scope = await db.queryOne<{ total: number }>({ text: SCOPED_COUNT_SQL, params: [request.warehouseId, request.ownerId] })
  if (Number(scope?.total ?? 0) === 0) return null
  const text = request.goodsCategoryId
    ? `${AGGREGATE_SQL} AND g.category_id = ?`
    : AGGREGATE_SQL
  const params = request.goodsCategoryId
    ? [request.warehouseId, request.ownerId, request.goodsCategoryId]
    : [request.warehouseId, request.ownerId]
  const row = await db.queryOne<{ stock_qty: number; locations: number; volume: number; weight: number; row_count: number }>({ text, params })
  if (!row || Number(row.row_count ?? 0) === 0) {
    // 该货品类别在库存中无记录：度量按 0 计（库存事实存在，仅该类别无业务量）
    return { stockQty: 0, locations: 0, volume: 0, weight: 0 }
  }
  return {
    stockQty: Number(row.stock_qty),
    locations: Number(row.locations),
    volume: Number(row.volume),
    weight: Number(row.weight),
  }
}

// 按天计费度量提供者：前一日库存（任务执行时点快照）
export const dailyMeasureProvider: MeasureProvider = {
  name: 'daily',
  getMeasure: (db, request) => aggregate(db, request),
}

// 按月计费度量提供者：月度口径（任务执行时点快照聚合）
export const monthlyMeasureProvider: MeasureProvider = {
  name: 'monthly',
  getMeasure: (db, request) => aggregate(db, request),
}
