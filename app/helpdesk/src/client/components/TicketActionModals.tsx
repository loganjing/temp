import { useState } from 'react'
import { api, fetchAllPages } from '../domain/api'
import { errorText, localizedName, localizedUser } from '../domain/format'
import { useAsync } from '../domain/hooks'
import type { TeamMember, TicketDetail } from '../domain/types'
import { useLocale, usePlatformText } from '../platform/i18n'
import { useSession } from '../platform/session'
import { Icon } from './icons'
import { Button, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, Textarea, useToast } from './ui'

export type ActionKind = 'resolve' | 'reject' | 'cancel' | 'hold' | 'assign' | 'transfer' | 'rating'

interface ModalProps {
  ticket: TicketDetail
  onClose: () => void
  onChanged: () => void
}

/** 通用确认弹窗（提交草稿/删除草稿/确认解决等直达动作） */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const t = usePlatformText()
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
            {busy ? t('common.busy') : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-slate-600">{message}</p>
    </Modal>
  )
}

function ResolveModal({ ticket, onClose, onChanged }: ModalProps) {
  const t = usePlatformText()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!note.trim() || busy) return
    setBusy(true)
    try {
      await api.resolve(ticket.id, note.trim())
      toast.success(t('detail.resolve.success'))
      onChanged()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('detail.resolve.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!note.trim() || busy} onClick={() => void submit()}>
            {busy ? t('common.busy') : t('detail.resolve.submit')}
          </Button>
        </>
      }
    >
      <Field label={t('detail.resolve.note')} required>
        <Textarea
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('detail.resolve.placeholder')}
        />
      </Field>
    </Modal>
  )
}

function RejectModal({ ticket, onClose, onChanged }: ModalProps) {
  const t = usePlatformText()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!reason.trim() || busy) return
    setBusy(true)
    try {
      await api.reject(ticket.id, reason.trim())
      toast.success(t('detail.reject.success'))
      onChanged()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('detail.reject.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!reason.trim() || busy} onClick={() => void submit()}>
            {busy ? t('common.busy') : t('detail.reject.submit')}
          </Button>
        </>
      }
    >
      <Field label={t('detail.reject.reason')} required>
        <Textarea
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('detail.reject.placeholder')}
        />
      </Field>
    </Modal>
  )
}

function CancelModal({ ticket, onClose, onChanged }: ModalProps) {
  const t = usePlatformText()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!reason.trim() || busy) return
    setBusy(true)
    try {
      await api.cancel(ticket.id, reason.trim())
      toast.success(t('detail.cancelTicket.success'))
      onChanged()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('detail.cancelTicket.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={!reason.trim() || busy} onClick={() => void submit()}>
            {busy ? t('common.busy') : t('detail.cancelTicket.submit')}
          </Button>
        </>
      }
    >
      <Field label={t('detail.cancelTicket.reason')} required>
        <Textarea
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('detail.cancelTicket.placeholder')}
        />
      </Field>
    </Modal>
  )
}

function HoldModal({ ticket, onClose, onChanged }: ModalProps) {
  const t = usePlatformText()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [expectedResumeAt, setExpectedResumeAt] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!reason.trim() || busy) return
    setBusy(true)
    try {
      await api.hold(ticket.id, {
        reason: reason.trim(),
        note: note.trim() || undefined,
        expectedResumeAt: expectedResumeAt ? new Date(expectedResumeAt).toISOString() : undefined,
      })
      toast.success(t('detail.hold.success'))
      onChanged()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('detail.hold.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!reason.trim() || busy} onClick={() => void submit()}>
            {busy ? t('common.busy') : t('detail.hold.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('detail.hold.reason')} required>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Field label={t('detail.hold.note')}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <Field label={t('detail.hold.expectedResumeAt')}>
          <Input
            type="datetime-local"
            value={expectedResumeAt}
            onChange={(event) => setExpectedResumeAt(event.target.value)}
          />
        </Field>
        <p className="text-xs text-slate-400">{t('detail.hold.slaHint')}</p>
      </div>
    </Modal>
  )
}

function AssignModal({ ticket, onClose, onChanged }: ModalProps) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const [teamId, setTeamId] = useState<number | ''>('')
  const [userId, setUserId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  const teams = useAsync(
    () => (ticket.department ? api.departmentTeams(ticket.department.id) : Promise.resolve([])),
    [ticket.department?.id],
  )
  const members = useAsync(
    () => (teamId ? api.teamMembers(teamId) : Promise.resolve([] as TeamMember[])),
    [teamId],
  )

  async function submit() {
    if (!teamId || !userId || busy) return
    setBusy(true)
    try {
      await api.assign(ticket.id, teamId, userId)
      toast.success(t('detail.assign.success'))
      onChanged()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('detail.assign.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!teamId || !userId || busy} onClick={() => void submit()}>
            {busy ? t('common.busy') : t('detail.assign.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.team')} required>
          {teams.loading ? (
            <LoadingBlock label={t('common.loading')} />
          ) : teams.error ? (
            <ErrorBlock error={teams.error} onRetry={teams.reload} retryLabel={t('common.retry')} />
          ) : (
            <Select
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value ? Number(event.target.value) : '')
                setUserId('')
              }}
            >
              <option value="">—</option>
              {(teams.data ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {localizedName(team, locale)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('detail.assign.user')} required>
          <Select value={userId} onChange={(event) => setUserId(event.target.value ? Number(event.target.value) : '')} disabled={!teamId}>
            <option value="">—</option>
            {(members.data ?? []).map((member) => (
              <option key={member.user.id} value={member.user.id} disabled={member.vacation?.state === 'on_leave'}>
                {localizedUser(member.user, locale)}
                {member.vacation
                  ? ` · ${member.vacation.state === 'on_leave' ? t('org.vacation.state.onLeave') : t('org.vacation.state.scheduled')}`
                  : ''}
              </option>
            ))}
          </Select>
          {members.data?.some((member) => member.vacation?.state === 'on_leave') ? (
            <p className="text-xs text-slate-400">{t('detail.assign.vacationHint')}</p>
          ) : null}
        </Field>
      </div>
    </Modal>
  )
}

function TransferModal({ ticket, onClose, onChanged }: ModalProps) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const { me } = useSession()
  const isAgent = me?.role === 'agent'
  const [deptId, setDeptId] = useState<number | ''>(ticket.department?.id ?? '')
  const [teamId, setTeamId] = useState<number | ''>('')
  const [userId, setUserId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  const departments = useAsync(() => fetchAllPages((page) => api.departments(page)), [])
  const teams = useAsync(
    () => (deptId ? api.departmentTeams(deptId) : Promise.resolve([])),
    [deptId],
  )
  const members = useAsync(
    () => (teamId ? api.teamMembers(teamId) : Promise.resolve([] as TeamMember[])),
    [teamId],
  )

  const canPickUser =
    (ticket.status === 'assigned' || ticket.status === 'in_progress') && deptId === ticket.department?.id
  // 专员目标限本部门同事或本部门经理；经理/管理员可整单转其他部门排队
  const managers =
    isAgent && departments.data
      ? (departments.data.find((department) => department.id === ticket.department?.id)?.managers ?? [])
      : []
  const memberIds = new Set((members.data ?? []).map((member) => member.user.id))
  const managerOptions = managers.filter((manager) => !memberIds.has(manager.id))

  async function submit() {
    if (!deptId || busy) return
    setBusy(true)
    try {
      await api.transfer(ticket.id, deptId, userId || undefined)
      toast.success(t('detail.transfer.success'))
      onChanged()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('detail.transfer.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!deptId || busy} onClick={() => void submit()}>
            {busy ? t('common.busy') : t('detail.transfer.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.department')} required>
          {isAgent ? (
            <Input readOnly value={ticket.department ? localizedName(ticket.department, locale) : '—'} />
          ) : departments.loading ? (
            <LoadingBlock label={t('common.loading')} />
          ) : departments.error ? (
            <ErrorBlock error={departments.error} onRetry={departments.reload} retryLabel={t('common.retry')} />
          ) : (
            <Select
              value={deptId}
              onChange={(event) => {
                setDeptId(event.target.value ? Number(event.target.value) : '')
                setTeamId('')
                setUserId('')
              }}
            >
              <option value="">—</option>
              {(departments.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {localizedName(department, locale)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {canPickUser ? (
          <>
            <Field label={t('common.team')}>
              {teams.loading ? (
                <LoadingBlock label={t('common.loading')} />
              ) : teams.error ? (
                <ErrorBlock error={teams.error} onRetry={teams.reload} retryLabel={t('common.retry')} />
              ) : (
                <Select
                  value={teamId}
                  onChange={(event) => {
                    setTeamId(event.target.value ? Number(event.target.value) : '')
                    setUserId('')
                  }}
                >
                  <option value="">—</option>
                  {(teams.data ?? []).map((team) => (
                    <option key={team.id} value={team.id}>
                      {localizedName(team, locale)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('detail.transfer.user')}>
              <Select
                value={userId}
                onChange={(event) => setUserId(event.target.value ? Number(event.target.value) : '')}
                disabled={!teamId}
              >
                <option value="">—</option>
                {(members.data ?? []).map((member) => (
                  <option key={member.user.id} value={member.user.id} disabled={member.vacation?.state === 'on_leave'}>
                    {localizedUser(member.user, locale)}
                    {member.vacation
                      ? ` · ${member.vacation.state === 'on_leave' ? t('org.vacation.state.onLeave') : t('org.vacation.state.scheduled')}`
                      : ''}
                  </option>
                ))}
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {localizedUser(manager, locale)} · {t('role.manager')}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <p className="text-xs text-slate-400">{t('detail.transfer.queueOnly')}</p>
        )}
      </div>
    </Modal>
  )
}

function RatingModal({ ticket, onClose, onChanged }: ModalProps) {
  const t = usePlatformText()
  const toast = useToast()
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (score < 1 || busy) return
    setBusy(true)
    try {
      await api.rate(ticket.id, score, comment.trim() || undefined)
      toast.success(t('detail.rating.success'))
      onChanged()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('detail.rating.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={score < 1 || busy} onClick={() => void submit()}>
            {busy ? t('common.busy') : t('detail.rating.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScore(value)}
              className="rounded p-1 hover:bg-slate-100"
              aria-label={`${value}`}
            >
              <Icon
                name="star"
                className={`h-6 w-6 ${value <= score ? 'fill-amber-400 stroke-amber-400' : 'stroke-slate-300'}`}
              />
            </button>
          ))}
        </div>
        <Field label={t('detail.rating.comment')}>
          <Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export function TicketActionModals({
  ticket,
  active,
  onClose,
  onChanged,
}: {
  ticket: TicketDetail
  active: ActionKind | null
  onClose: () => void
  onChanged: () => void
}) {
  return (
    <>
      {active === 'resolve' && <ResolveModal ticket={ticket} onClose={onClose} onChanged={onChanged} />}
      {active === 'reject' && <RejectModal ticket={ticket} onClose={onClose} onChanged={onChanged} />}
      {active === 'cancel' && <CancelModal ticket={ticket} onClose={onClose} onChanged={onChanged} />}
      {active === 'hold' && <HoldModal ticket={ticket} onClose={onClose} onChanged={onChanged} />}
      {active === 'assign' && <AssignModal ticket={ticket} onClose={onClose} onChanged={onChanged} />}
      {active === 'transfer' && <TransferModal ticket={ticket} onClose={onClose} onChanged={onChanged} />}
      {active === 'rating' && <RatingModal ticket={ticket} onClose={onClose} onChanged={onChanged} />}
    </>
  )
}
