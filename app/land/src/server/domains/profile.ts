/**
 * parcel-profile 域：地块档案读取/部分更新、核查清单与地价双向录入 D4（契约第 3 节）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, decimalInput, optionalString, optionalBoolean, optionalInt, currentActor } from '../lib/api'
import { auditEvent, loadParcel, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'
import { dec, div, fmt, mul, isZero } from '../engine/decimal'

export const CHECKLIST_ITEMS = [
  'title-verified', 'use-supported', 'conversion-needed', 'plot-ratio-basis', 'school-contribution',
  'cemetery-contribution', 'road-drainage', 'site-conditions', 'charges-in-landprice', 'charges-in-cost',
] as const
export const CHECKLIST_STATUSES = ['confirmed', 'assumed', 'pending'] as const

const PROFILE_TEXT_FIELDS: Record<string, string> = {
  address: 'address',
  lotInfo: 'lot_info',
  currentUse: 'current_use',
  plannedUse: 'planned_use',
  zoning: 'zoning',
  allowedDevelopment: 'allowed_development',
  paymentTerms: 'payment_terms',
  landFinancingNote: 'land_financing_note',
  otherGovChargesNote: 'other_gov_charges_note',
  ownershipCompany: 'ownership_company',
  assetAttribution: 'asset_attribution',
}
const PROFILE_DECIMAL_FIELDS: Record<string, string> = {
  vendorAskingPrice: 'vendor_asking_price',
  totalLandPrice: 'total_land_price',
  unitLandPrice: 'unit_land_price',
  conversionPremium: 'conversion_premium',
  developmentCharges: 'development_charges',
}
const BASE_PARCEL_FIELDS: Record<string, string> = {
  internalNo: 'internal_no',
  state: 'state',
  city: 'city',
  district: 'district',
}

function mapProfile(parcel: Row, profile: Row | null, defaultAreaConventionId: string | null) {
  const checklist = parseJsonColumn<Array<{ item: string; status: string; note: string | null }>>(profile?.checklist_json, [])
  return {
    name: String(parcel.name),
    internalNo: parcel.internal_no === null ? null : String(parcel.internal_no),
    state: parcel.state === null ? null : String(parcel.state),
    city: parcel.city === null ? null : String(parcel.city),
    district: parcel.district === null ? null : String(parcel.district),
    address: nullableText(profile, 'address'),
    lotInfo: nullableText(profile, 'lot_info'),
    tenure: nullableText(profile, 'tenure'),
    tenureYears: profile?.tenure_years === null || profile?.tenure_years === undefined ? null : Number(profile.tenure_years),
    totalLandAreaSqft: nullableText(profile, 'total_land_area_sqft'),
    currentUse: nullableText(profile, 'current_use'),
    plannedUse: nullableText(profile, 'planned_use'),
    zoning: nullableText(profile, 'zoning'),
    allowedDevelopment: nullableText(profile, 'allowed_development'),
    vendorAskingPrice: nullableText(profile, 'vendor_asking_price'),
    totalLandPrice: nullableText(profile, 'total_land_price'),
    unitLandPrice: nullableText(profile, 'unit_land_price'),
    landPriceLastEditedBasis: nullableText(profile, 'land_price_last_edited_basis'),
    paymentTerms: nullableText(profile, 'payment_terms'),
    landFinancingNote: nullableText(profile, 'land_financing_note'),
    needsConversion: Boolean(profile?.needs_conversion),
    conversionPremium: nullableText(profile, 'conversion_premium'),
    developmentCharges: nullableText(profile, 'development_charges'),
    otherGovChargesNote: nullableText(profile, 'other_gov_charges_note'),
    checklist: checklist.map((entry) => ({
      item: entry.item,
      status: entry.status,
      note: entry.note ?? null,
    })),
    ownershipCompany: nullableText(profile, 'ownership_company'),
    assetAttribution: nullableText(profile, 'asset_attribution'),
    defaultAreaConventionId,
  }
}

function nullableText(row: Row | null | undefined, key: string): string | null {
  const value = row?.[key]
  if (value === null || value === undefined) return null
  return String(value)
}

export async function defaultAreaConventionId(db: Platform['db'], state: string | null): Promise<string | null> {
  if (state) {
    const byState = await db.queryOne<Row>({
      text: "SELECT id FROM parameter_sets WHERE kind = 'area-convention' AND region = ? ORDER BY effective_at DESC, version DESC LIMIT 1",
      params: [state],
    })
    if (byState) return String(byState.id)
  }
  const general = await db.queryOne<Row>({
    text: "SELECT id FROM parameter_sets WHERE kind = 'area-convention' AND region IS NULL ORDER BY effective_at DESC, version DESC LIMIT 1",
  })
  return general ? String(general.id) : null
}

export const registerProfileRoutes: DomainRoutes = (app, platform) => {
  app.get('/api/parcels/:id/profile', async (context) => {
    const parcel = await loadParcel(platform.db, context.req.param('id'))
    const profile = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_profile WHERE parcel_id = ?', params: [String(parcel.id)] })
    return context.json(mapProfile(parcel, profile, await defaultAreaConventionId(platform.db, parcel.state ? String(parcel.state) : null)))
  })

  app.patch('/api/parcels/:id/profile', async (context) => {
    await requirePermission(context, platform, 'parcel-profile:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const existing = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_profile WHERE parcel_id = ?', params: [parcelId] })
    const updates: Record<string, unknown> = {}
    const changed: string[] = []

    for (const [requestKey, column] of Object.entries(PROFILE_TEXT_FIELDS)) {
      if (body[requestKey] !== undefined) {
        updates[column] = optionalString(body[requestKey], requestKey)
        changed.push(requestKey)
      }
    }
    for (const [requestKey, column] of Object.entries(PROFILE_DECIMAL_FIELDS)) {
      if (body[requestKey] !== undefined) {
        updates[column] = decimalInput(body[requestKey])
        changed.push(requestKey)
      }
    }
    for (const [requestKey, column] of Object.entries(BASE_PARCEL_FIELDS)) {
      if (body[requestKey] !== undefined) {
        updates[column] = optionalString(body[requestKey], requestKey)
        changed.push(requestKey)
      }
    }
    if (body.tenure !== undefined) {
      const tenure = optionalString(body.tenure, 'tenure', 40)
      if (tenure !== null && tenure !== 'freehold' && tenure !== 'leasehold') {
        throw errors.validationFailed([{ field: 'tenure', reason: 'must be freehold or leasehold' }])
      }
      updates.tenure = tenure
      changed.push('tenure')
    }
    if (body.tenureYears !== undefined) {
      updates.tenure_years = optionalInt(body.tenureYears, 'tenureYears')
      changed.push('tenureYears')
    }
    if (body.totalLandAreaSqft !== undefined) {
      updates.total_land_area_sqft = decimalInput(body.totalLandAreaSqft)
      changed.push('totalLandAreaSqft')
    }
    if (body.needsConversion !== undefined) {
      const flag = optionalBoolean(body.needsConversion, 'needsConversion')
      updates.needs_conversion = flag === true ? 1 : 0
      changed.push('needsConversion')
    }
    if (body.checklist !== undefined) {
      if (!Array.isArray(body.checklist)) throw errors.validationFailed([{ field: 'checklist', reason: 'must be an array' }])
      const checklist = body.checklist.map((entry) => {
        if (typeof entry !== 'object' || entry === null) throw errors.validationFailed([{ field: 'checklist', reason: 'entries must be objects' }])
        const record = entry as Record<string, unknown>
        const item = optionalString(record.item, 'checklist.item', 60)
        const status = optionalString(record.status, 'checklist.status', 20)
        if (!item || !(CHECKLIST_ITEMS as readonly string[]).includes(item)) {
          throw errors.validationFailed([{ field: 'checklist.item', reason: `must be one of ${CHECKLIST_ITEMS.join(' | ')}` }])
        }
        if (!status || !(CHECKLIST_STATUSES as readonly string[]).includes(status)) {
          throw errors.validationFailed([{ field: 'checklist.status', reason: 'must be confirmed | assumed | pending' }])
        }
        return { item, status, note: optionalString(record.note, 'checklist.note') }
      })
      updates.checklist_json = JSON.stringify(checklist)
      changed.push('checklist')
    }

    // D4 地价双向录入：同请求提交两字段时按 landPriceLastEditedBasis 全精度换算另一侧。
    const totalLandPrice = body.totalLandPrice !== undefined ? decimalInput(body.totalLandPrice) : undefined
    const unitLandPrice = body.unitLandPrice !== undefined ? decimalInput(body.unitLandPrice) : undefined
    const lastEditedBasis = optionalString(body.landPriceLastEditedBasis, 'landPriceLastEditedBasis', 20)
    let landArea = existing?.total_land_area_sqft ? String(existing.total_land_area_sqft) : null
    if (body.totalLandAreaSqft !== undefined) landArea = decimalInput(body.totalLandAreaSqft)
    if (landArea === null) {
      landArea = parcel.area_sqft ? String(parcel.area_sqft) : null
    }
    if ((totalLandPrice !== undefined || unitLandPrice !== undefined) && lastEditedBasis) {
      if (lastEditedBasis !== 'total' && lastEditedBasis !== 'unit') {
        throw errors.validationFailed([{ field: 'landPriceLastEditedBasis', reason: 'must be total or unit' }])
      }
      const area = landArea ? dec(landArea) : null
      if (lastEditedBasis === 'total') {
        const total = totalLandPrice ?? (existing?.total_land_price ? String(existing.total_land_price) : null)
        if (total && area && !isZero(area)) {
          updates.unit_land_price = fmt(div(dec(total), area))
        } else if (total === null) {
          updates.unit_land_price = null
        }
        updates.total_land_price = total
      } else {
        const unit = unitLandPrice ?? (existing?.unit_land_price ? String(existing.unit_land_price) : null)
        if (unit && area) {
          updates.total_land_price = fmt(mul(dec(unit), area))
        } else if (unit === null) {
          updates.total_land_price = null
        }
        updates.unit_land_price = unit
      }
      updates.land_price_last_edited_basis = lastEditedBasis
      changed.push('landPrice(D4)')
    } else {
      if (totalLandPrice !== undefined) updates.total_land_price = totalLandPrice
      if (unitLandPrice !== undefined) updates.unit_land_price = unitLandPrice
    }

    if (Object.keys(updates).length === 0) {
      throw errors.validationFailed([{ field: 'body', reason: 'no profile fields provided' }])
    }
    updates.updated_at = nowIso()
    const timestamp = String(updates.updated_at)

    if (existing) {
      const setSql = Object.keys(updates).map((key) => `${key} = ?`).join(', ')
      await platform.db.run({ text: `UPDATE parcel_profile SET ${setSql} WHERE parcel_id = ?`, params: [...Object.values(updates), parcelId] })
    } else {
      const columns = ['parcel_id', ...Object.keys(updates)]
      await platform.db.run({
        text: `INSERT INTO parcel_profile (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        params: [parcelId, ...Object.values(updates)],
      })
      await platform.db.run({ text: 'UPDATE parcels SET updated_at = ? WHERE id = ?', params: [timestamp, parcelId] })
    }
    // 同步台账基础字段（state/city/district/internalNo 同 parcels 表保持一致）。
    const parcelUpdates: Record<string, unknown> = {}
    for (const [requestKey, column] of Object.entries(BASE_PARCEL_FIELDS)) {
      if (updates[column] !== undefined) parcelUpdates[column] = updates[column]
    }
    if (Object.keys(parcelUpdates).length > 0) {
      parcelUpdates.updated_at = timestamp
      const setSql = Object.keys(parcelUpdates).map((key) => `${key} = ?`).join(', ')
      await platform.db.run({ text: `UPDATE parcels SET ${setSql} WHERE id = ?`, params: [...Object.values(parcelUpdates), parcelId] })
    }

    await auditEvent(platform, {
      type: 'parcel.profile.updated',
      actorUserId: actor.id,
      objectType: 'parcel',
      objectId: parcelId,
      summary: `更新档案字段：${changed.join(', ')}`,
      metadata: { fields: changed },
    })
    const profile = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_profile WHERE parcel_id = ?', params: [parcelId] })
    const refreshedParcel = await loadParcel(platform.db, parcelId)
    return context.json(mapProfile(refreshedParcel, profile, await defaultAreaConventionId(platform.db, refreshedParcel.state ? String(refreshedParcel.state) : null)))
  })
}
