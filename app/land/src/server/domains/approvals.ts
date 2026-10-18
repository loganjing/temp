/**
 * approval 域：提交审批、通过/采用冻结、退回、决策记录（契约第 9 节 / AC-08）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, currentActor } from '../lib/api'
import { auditEvent, loadParcel, loadPlan, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'

export const DECISION_ACTIONS = ['continue', 'abandon', 'negotiate', 'site-visit', 'jv'] as const

function mapSubmission(row: Row) {
  return {
    id: String(row.id),
    parcelId: String(row.parcel_id),
    submittedBy: String(row.submitted_by),
    submittedAt: String(row.submitted_at),
    status: String(row.status),
    note: row.note === null ? null : String(row.note),
  }
}

export const registerApprovalRoutes: DomainRoutes = (app, platform) => {
  app.post('/api/parcels/:id/submissions', async (context) => {
    await requirePermission(context, platform, 'submissions:create')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    const parcel = await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const planIds = Array.isArray(body.planIds) ? body.planIds.map((item) => String(item)) : []
    if (planIds.length === 0) throw errors.validationFailed([{ field: 'planIds', reason: 'at least one plan is required' }])
    const note = optionalString(body.note, 'note', 2000)
    const plans: Row[] = []
    for (const planId of planIds) {
      const plan = await loadPlan(platform.db, planId)
      if (String(plan.parcel_id) !== parcelId) {
        throw errors.validationFailed([{ field: 'planIds', reason: `plan ${planId} belongs to another parcel` }])
      }
      if (String(plan.status) !== 'formalized') throw errors.notFormalized()
      plans.push(plan)
    }
    const id = newId('sub')
    const timestamp = nowIso()
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO submissions (id, parcel_id, plan_ids_json, submitted_by, submitted_at, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [id, parcelId, JSON.stringify(planIds), actor.id, timestamp, 'pending', note],
      })
      for (const planId of planIds) {
        await tx.run({ text: "UPDATE plans SET status = 'in_review', updated_at = ? WHERE id = ?", params: [timestamp, planId] })
      }
      if (String(parcel.status) === 'processing') {
        await tx.run({ text: 'UPDATE parcels SET status = ?, updated_at = ? WHERE id = ?', params: ['in_review', timestamp, parcelId] })
      }
    })
    await auditEvent(platform, {
      type: 'submission.created',
      actorUserId: actor.id,
      objectType: 'submission',
      objectId: id,
      summary: `提交审批（方案 ${planIds.join(', ')}）`,
      metadata: { planIds, parcelId },
    })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM submissions WHERE id = ?', params: [id] })
    return context.json(mapSubmission(row!), 201)
  })

  app.get('/api/submissions/:id', async (context) => {
    const id = context.req.param('id')
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM submissions WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('Submission not found')
    const planIds = parseJsonColumn<string[]>(row.plan_ids_json, [])
    const plans = []
    for (const planId of planIds) {
      const plan = await platform.db.queryOne<Row>({ text: 'SELECT * FROM plans WHERE id = ?', params: [planId] })
      if (!plan) continue
      const snapshot = await platform.db.queryOne<Row>({ text: "SELECT id, results_json, created_at FROM plan_snapshots WHERE plan_id = ? AND kind = 'formalized' ORDER BY created_at DESC LIMIT 1", params: [planId] })
      plans.push({
        id: String(plan.id),
        name: String(plan.name),
        kind: String(plan.kind),
        status: String(plan.status),
        parcelId: String(plan.parcel_id),
        assumptionTags: parseJsonColumn<string[]>(plan.assumption_tags_json, []),
        formalizedSnapshot: snapshot
          ? { snapshotId: String(snapshot.id), results: parseJsonColumn<unknown>(snapshot.results_json, null), formalizedAt: String(snapshot.created_at) }
          : null,
      })
    }
    const actions = await platform.db.queryAll<Row>({ text: 'SELECT * FROM submission_actions WHERE submission_id = ? ORDER BY at', params: [id] })
    const returnCount = actions.filter((action) => String(action.action) === 'return').length
    return context.json({
      ...mapSubmission(row),
      plans,
      actions: actions.map((action) => ({
        id: String(action.id),
        actor: String(action.actor),
        action: String(action.action),
        reason: action.reason === null ? null : String(action.reason),
        selectedPlanId: action.selected_plan_id === null ? null : String(action.selected_plan_id),
        at: String(action.at),
      })),
      returnCount,
    })
  })

  app.post('/api/submissions/:id/approve', async (context) => {
    await requirePermission(context, platform, 'submissions:approve')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM submissions WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('Submission not found')
    const currentStatus = String(row.status)
    if (currentStatus === 'approved') {
      // 幂等：重复 approve 返回当前状态（审计记录每次尝试）。
      await auditEvent(platform, { type: 'submission.approve.repeated', actorUserId: actor.id, objectType: 'submission', objectId: id, summary: '重复提交通过动作（幂等返回）' })
      return context.json(mapSubmission(row))
    }
    if (currentStatus === 'returned') {
      throw errors.statusConflict('returned submission requires a new submission after adjustment')
    }
    const body = await readJsonBody(context)
    const selectedPlanId = requiredString(body.selectedPlanId, 'selectedPlanId', 100)
    const reason = optionalString(body.reason, 'reason', 2000)
    const planIds = parseJsonColumn<string[]>(row.plan_ids_json, [])
    if (!planIds.includes(selectedPlanId)) {
      throw errors.validationFailed([{ field: 'selectedPlanId', reason: 'selected plan is not part of this submission' }])
    }
    const timestamp = nowIso()
    const actionId = newId('sua')
    const parcelId = String(row.parcel_id)
    await platform.db.transaction(async (tx) => {
      for (const planId of planIds) {
        if (planId === selectedPlanId) {
          const plan = await tx.queryOne<Row>({ text: 'SELECT * FROM plans WHERE id = ?', params: [planId] })
          const snapshotId = newId('psn')
          await tx.run({
            text: 'INSERT INTO plan_snapshots (id, plan_id, kind, inputs_json, results_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            params: [snapshotId, planId, 'adopted', JSON.stringify({ source: 'adopted', inputs: plan?.area_basis_json ?? null }), plan?.results_json ?? null, timestamp, actor.id],
          })
          await tx.run({ text: "UPDATE plans SET status = 'adopted', updated_at = ? WHERE id = ?", params: [timestamp, planId] })
        } else {
          await tx.run({ text: "UPDATE plans SET status = 'not_selected', updated_at = ? WHERE id = ?", params: [timestamp, planId] })
        }
      }
      await tx.run({
        text: 'INSERT INTO submission_actions (id, submission_id, actor, action, reason, selected_plan_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [actionId, id, actor.id, 'approve', reason, selectedPlanId, timestamp],
      })
      await tx.run({ text: 'UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?', params: ['approved', timestamp, id] })
      await tx.run({ text: 'UPDATE parcels SET adopted_plan_id = ?, status = ?, updated_at = ? WHERE id = ?', params: [selectedPlanId, 'completed', timestamp, parcelId] })
      await tx.run({
        text: `INSERT INTO decision_records (parcel_id, adopted_plan_id, action, reason, decided_at, decided_by, handoff_to) VALUES (?, ?, 'continue', ?, ?, ?, NULL)
               ON CONFLICT(parcel_id) DO UPDATE SET adopted_plan_id = excluded.adopted_plan_id, action = 'continue', reason = excluded.reason, decided_at = excluded.decided_at, decided_by = excluded.decided_by`,
        params: [parcelId, selectedPlanId, reason ?? '审批通过并采用方案', timestamp, actor.id],
      })
    })
    await auditEvent(platform, {
      type: 'submission.approved',
      actorUserId: actor.id,
      objectType: 'submission',
      objectId: id,
      summary: `审批通过并采用方案 ${selectedPlanId}`,
      metadata: { selectedPlanId, parcelId },
    })
    const refreshed = await platform.db.queryOne<Row>({ text: 'SELECT * FROM submissions WHERE id = ?', params: [id] })
    return context.json({ ...mapSubmission(refreshed!), selectedPlanId })
  })

  app.post('/api/submissions/:id/return', async (context) => {
    await requirePermission(context, platform, 'submissions:approve')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM submissions WHERE id = ?', params: [id] })
    if (!row) throw errors.notFound('Submission not found')
    const currentStatus = String(row.status)
    if (currentStatus === 'returned') return context.json(mapSubmission(row))
    if (currentStatus === 'approved') throw errors.statusConflict('approved submission cannot be returned')
    const body = await readJsonBody(context)
    // 契约 §9：退回必须带 reason，缺失时专用错误码 RETURN_REASON_REQUIRED。
    const reason = optionalString(body.reason, 'reason', 2000)
    if (!reason) throw errors.returnReasonRequired()
    const planIds = parseJsonColumn<string[]>(row.plan_ids_json, [])
    const timestamp = nowIso()
    const actionId = newId('sua')
    const parcelId = String(row.parcel_id)
    await platform.db.transaction(async (tx) => {
      for (const planId of planIds) {
        await tx.run({ text: "UPDATE plans SET status = 'returned', updated_at = ? WHERE id = ?", params: [timestamp, planId] })
      }
      await tx.run({
        text: 'INSERT INTO submission_actions (id, submission_id, actor, action, reason, selected_plan_id, at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
        params: [actionId, id, actor.id, 'return', reason, timestamp],
      })
      await tx.run({ text: 'UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?', params: ['returned', timestamp, id] })
      await tx.run({ text: 'UPDATE parcels SET status = ?, updated_at = ? WHERE id = ?', params: ['processing', timestamp, parcelId] })
    })
    await auditEvent(platform, {
      type: 'submission.returned',
      actorUserId: actor.id,
      objectType: 'submission',
      objectId: id,
      summary: `退回审批：${reason}`,
      metadata: { planIds, parcelId },
    })
    const refreshed = await platform.db.queryOne<Row>({ text: 'SELECT * FROM submissions WHERE id = ?', params: [id] })
    return context.json(mapSubmission(refreshed!))
  })

  app.get('/api/parcels/:id/decision-record', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM decision_records WHERE parcel_id = ?', params: [parcelId] })
    if (!row) {
      const parcel = await loadParcel(platform.db, parcelId)
      return context.json({
        parcelId,
        adoptedPlanId: parcel.adopted_plan_id === null ? null : String(parcel.adopted_plan_id),
        action: null,
        reason: null,
        decidedAt: null,
        decidedBy: null,
        handoffTo: null,
      })
    }
    return context.json({
      parcelId,
      adoptedPlanId: row.adopted_plan_id === null ? null : String(row.adopted_plan_id),
      action: String(row.action),
      reason: String(row.reason),
      decidedAt: String(row.decided_at),
      decidedBy: String(row.decided_by),
      handoffTo: row.handoff_to === null ? null : String(row.handoff_to),
    })
  })
}
