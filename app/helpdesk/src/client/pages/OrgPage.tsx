import { useState } from 'react'
import { api, fetchAllPages } from '../domain/api'
import { errorText, formatDate, localizedName, localizedUser, statusText } from '../domain/format'
import { useAsync } from '../domain/hooks'
import type { Department, Team, TeamMember, TeamVacation } from '../domain/types'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../components/ui'
import { RangeCalendar } from '../components/RangeCalendar'
import { useLocale, usePlatformText } from '../platform/i18n'
import { useSession } from '../platform/session'

type Translate = (key: string) => string

/** 组织管理（需求 §6.6）：部门 → Team → 成员卡片（休假三态 + 区间日历） */
export function OrgPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const { me } = useSession()
  const toast = useToast()
  const isAdmin = me?.role === 'admin'

  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [teamId, setTeamId] = useState<number | null>(null)
  const [departmentModal, setDepartmentModal] = useState<Department | 'new' | null>(null)
  const [teamModal, setTeamModal] = useState<{ team: Team | 'new'; departmentId: number } | null>(null)
  const [addMemberTeam, setAddMemberTeam] = useState<Team | null>(null)
  const [addMemberDepartment, setAddMemberDepartment] = useState<Department | null>(null)
  const [vacationTarget, setVacationTarget] = useState<{ teamId: number; member: TeamMember } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{ teamId: number; member: TeamMember } | null>(null)

  const departments = useAsync(() => fetchAllPages((page) => api.departments(page)), [])
  const selected = departments.data?.find((department) => department.id === departmentId) ?? null
  const teams = useAsync(
    () => (departmentId ? api.departmentTeams(departmentId) : Promise.resolve([])),
    [departmentId],
  )
  const selectedTeam = teams.data?.find((team) => team.id === teamId) ?? null
  const members = useAsync(() => (teamId ? api.teamMembers(teamId) : Promise.resolve([])), [teamId])

  function selectDepartment(id: number) {
    setDepartmentId(id)
    setTeamId(null)
  }

  async function toggleTeamStatus(team: Team) {
    try {
      await api.setTeamStatus(team.id, team.status === 'active' ? 'inactive' : 'active')
      toast.success(t('common.saved'))
      teams.reload()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    }
  }

  async function cancelVacation(teamId: number, member: TeamMember) {
    try {
      await api.cancelVacation(teamId, member.user.id)
      toast.success(t('common.saved'))
      members.reload()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    }
  }

  async function removeMember() {
    if (!removeTarget) return
    try {
      await api.removeTeamMember(removeTarget.teamId, removeTarget.member.user.id)
      toast.success(t('common.saved'))
      members.reload()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setRemoveTarget(null)
    }
  }

  return (
    <div className="flex items-start gap-4 p-6">
      <aside className="w-56 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">{t('org.departments')}</h2>
          {isAdmin && (
            <Button icon="plus" onClick={() => setDepartmentModal('new')} aria-label="new-department">
              <span className="sr-only">{t('org.createDepartment')}</span>
            </Button>
          )}
        </div>
        {departments.loading && !departments.data ? (
          <LoadingBlock label={t('common.loading')} />
        ) : departments.error ? (
          <ErrorBlock error={departments.error} onRetry={departments.reload} retryLabel={t('common.retry')} />
        ) : departments.data && departments.data.length === 0 ? (
          <EmptyBlock label={t('org.noDepartment')} icon="sitemap" />
        ) : (
          <nav className="space-y-1">
            {(departments.data ?? []).map((department) => (
              <button
                key={department.id}
                type="button"
                onClick={() => selectDepartment(department.id)}
                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  department.id === departmentId
                    ? 'bg-indigo-50 font-medium text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {localizedName(department, locale)}
              </button>
            ))}
          </nav>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-5">
        {selected ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-slate-800">
                  {localizedName(selected, locale)}
                  <span className="ml-2 font-mono text-xs text-slate-400">{selected.code}</span>
                </h1>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span>
                    {t('org.managers')}：
                    {(selected.managers ?? []).map((manager) => localizedUser(manager, locale)).join('、') || '—'}
                  </span>
                  <span>
                    {t('org.teamCount')}：{selected.teamCount ?? teams.data?.length ?? 0}
                  </span>
                  <span>
                    {t('org.assignMode')}：
                    {t(selected.assignMode === 'manual' ? 'org.assignModeValue.manual' : 'org.assignModeValue.auto')}
                  </span>
                  <span>{statusText(t, selected.status)}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {isAdmin && (
                  <Button icon="edit" onClick={() => setDepartmentModal(selected)}>
                    {t('common.edit')}
                  </Button>
                )}
                <Button icon="plus" onClick={() => setAddMemberDepartment(selected)}>
                  {t('org.addDepartmentMember')}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">{t('org.departmentMemberHint')}</p>
          </section>
        ) : (
          <EmptyBlock label={t('org.selectDepartment')} icon="sitemap" />
        )}

        {selected && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-700">{t('org.teams')}</h2>
              {isAdmin && (
                <Button icon="plus" onClick={() => setTeamModal({ team: 'new', departmentId: selected.id })}>
                  {t('org.createTeam')}
                </Button>
              )}
            </div>
            {teams.loading && !teams.data ? (
              <LoadingBlock label={t('common.loading')} />
            ) : teams.error ? (
              <ErrorBlock error={teams.error} onRetry={teams.reload} retryLabel={t('common.retry')} />
            ) : teams.data && teams.data.length === 0 ? (
              <EmptyBlock label={t('org.noTeam')} icon="users" />
            ) : (
              <div className="space-y-2">
                {(teams.data ?? []).map((team) => (
                  <div
                    key={team.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2 ${
                      team.id === teamId ? 'border-indigo-300' : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setTeamId(team.id)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-700 hover:text-indigo-700"
                    >
                      {localizedName(team, locale)}
                      <span className="ml-2 font-mono text-xs text-slate-400">{team.code}</span>
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {statusText(t, team.status)}
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button icon="edit" onClick={() => setTeamModal({ team, departmentId: selected.id })}>
                        {t('common.edit')}
                      </Button>
                      <Button onClick={() => void toggleTeamStatus(team)}>
                        {team.status === 'active' ? t('org.disable') : t('org.enable')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {selectedTeam && teamId && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-700">
                {t('org.members')} · {localizedName(selectedTeam, locale)}
              </h2>
              <Button icon="plus" onClick={() => setAddMemberTeam(selectedTeam)}>
                {t('org.addMember')}
              </Button>
            </div>
            <p className="text-xs text-slate-400">{t('org.teamMemberHint')}</p>
            {members.loading && !members.data ? (
              <LoadingBlock label={t('common.loading')} />
            ) : members.error ? (
              <ErrorBlock error={members.error} onRetry={members.reload} retryLabel={t('common.retry')} />
            ) : members.data && members.data.length === 0 ? (
              <EmptyBlock label={t('org.noMembers')} icon="users" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {(members.data ?? []).map((member) => (
                  <div key={member.user.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800">{localizedUser(member.user, locale)}</div>
                        <div className="text-xs text-slate-400">{member.user.email}</div>
                        <div className="mt-2">
                          <VacationBadge vacation={member.vacation} />
                        </div>
                        {member.vacation?.autoReplyText && (
                          <p className="mt-1 max-w-xs truncate text-xs text-slate-400" title={member.vacation.autoReplyText}>
                            {member.vacation.autoReplyText}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button icon="calendar" onClick={() => setVacationTarget({ teamId, member })}>
                          {t('org.vacation.set')}
                        </Button>
                        {member.vacation && (
                          <Button onClick={() => void cancelVacation(teamId, member)}>
                            {t('org.vacation.cancel')}
                          </Button>
                        )}
                        <Button variant="danger" icon="trash" onClick={() => setRemoveTarget({ teamId, member })}>
                          {t('org.removeMember')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {departmentModal && (
        <DepartmentModal department={departmentModal} onClose={() => setDepartmentModal(null)} onSaved={departments.reload} />
      )}
      {teamModal && selected && (
        <TeamModal
          team={teamModal.team}
          departmentId={teamModal.departmentId}
          onClose={() => setTeamModal(null)}
          onSaved={teams.reload}
        />
      )}
      {addMemberTeam && (
        <AddMemberModal team={addMemberTeam} onClose={() => setAddMemberTeam(null)} onSaved={members.reload} />
      )}
      {addMemberDepartment && (
        <AddDepartmentMemberModal
          department={addMemberDepartment}
          onClose={() => setAddMemberDepartment(null)}
          onSaved={() => {
            // 部门维度引入新人后，其是否可入 Team 取决于服务端候选池口径，仅刷新成员列表即可
            members.reload()
          }}
        />
      )}
      {vacationTarget && (
        <VacationModal
          teamId={vacationTarget.teamId}
          member={vacationTarget.member}
          onClose={() => setVacationTarget(null)}
          onSaved={members.reload}
        />
      )}
      <Modal
        open={!!removeTarget}
        title={t('org.removeMember')}
        onClose={() => setRemoveTarget(null)}
        footer={
          <>
            <Button onClick={() => setRemoveTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => void removeMember()}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('org.removeMemberConfirm', { name: removeTarget ? localizedUser(removeTarget.member.user, locale) : '' })}</p>
      </Modal>
    </div>
  )
}

function VacationBadge({ vacation }: { vacation: TeamVacation | null }) {
  const t = usePlatformText()
  if (!vacation) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        {t('org.vacation.state.onDuty')}
      </span>
    )
  }
  const range = `${formatDate(vacation.startDate)} ~ ${formatDate(vacation.endDate)}`
  const onLeave = vacation.state === 'on_leave'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        onLeave ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700'
      }`}
    >
      {t(onLeave ? 'org.vacation.state.onLeave' : 'org.vacation.state.scheduled')} · {range}
    </span>
  )
}

function DepartmentModal({
  department,
  onClose,
  onSaved,
}: {
  department: Department | 'new'
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const toast = useToast()
  const editing = typeof department === 'object' ? department : null
  const users = useAsync(() => fetchAllPages((page) => api.adminUsers(page)), [])
  const [code, setCode] = useState(editing?.code ?? '')
  const [nameZh, setNameZh] = useState(editing?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '')
  const [managerIds, setManagerIds] = useState<number[]>((editing?.managers ?? []).map((manager) => manager.id))
  const [assignMode, setAssignMode] = useState<'auto' | 'manual'>(editing?.assignMode === 'manual' ? 'manual' : 'auto')
  const [status, setStatus] = useState(editing?.status ?? 'active')
  const [busy, setBusy] = useState(false)

  function toggleManager(id: number) {
    setManagerIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  async function save() {
    if (busy) return
    if (!code.trim() || !nameZh.trim()) {
      toast.error(t('form.validation.missing'))
      return
    }
    setBusy(true)
    try {
      const body = { code: code.trim(), nameZh: nameZh.trim(), nameEn: nameEn.trim(), managerIds, assignMode, status }
      if (editing) await api.updateDepartment(editing.id, body)
      else await api.createDepartment(body)
      toast.success(t('common.saved'))
      onSaved()
      onClose()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={editing ? t('org.editDepartment') : t('org.createDepartment')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? t('common.busy') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.code')} required>
          <Input value={code} onChange={(event) => setCode(event.target.value)} disabled={!!editing} />
        </Field>
        <Field label={t('common.nameZh')} required>
          <Input value={nameZh} onChange={(event) => setNameZh(event.target.value)} />
        </Field>
        <Field label={t('common.nameEn')}>
          <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </Field>
        <Field label={t('org.assignMode')}>
          <Select value={assignMode} onChange={(event) => setAssignMode(event.target.value as 'auto' | 'manual')}>
            <option value="auto">{t('org.assignModeValue.auto')}</option>
            <option value="manual">{t('org.assignModeValue.manual')}</option>
          </Select>
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">{t('common.statusValue.active')}</option>
            <option value="inactive">{t('common.statusValue.inactive')}</option>
          </Select>
        </Field>
        <Field label={t('org.managers')}>
          {users.loading ? (
            <LoadingBlock label={t('common.loading')} />
          ) : users.error ? (
            <ErrorBlock error={users.error} onRetry={users.reload} retryLabel={t('common.retry')} />
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {(users.data ?? []).map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={managerIds.includes(user.id)}
                    onChange={() => toggleManager(user.id)}
                  />
                  {localizedUser(user, 'zh')}（{user.email}）
                </label>
              ))}
            </div>
          )}
        </Field>
        <p className="text-xs text-slate-400">{t('org.assignModeHint')}</p>
      </div>
    </Modal>
  )
}

function TeamModal({
  team,
  departmentId,
  onClose,
  onSaved,
}: {
  team: Team | 'new'
  departmentId: number
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const toast = useToast()
  const editing = typeof team === 'object' ? team : null
  const [code, setCode] = useState(editing?.code ?? '')
  const [nameZh, setNameZh] = useState(editing?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'active')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    if (!code.trim() || !nameZh.trim()) {
      toast.error(t('form.validation.missing'))
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await api.updateTeam(editing.id, { nameZh: nameZh.trim(), nameEn: nameEn.trim() })
        await api.setTeamStatus(editing.id, status)
      } else {
        await api.createTeam({
          departmentId,
          code: code.trim(),
          nameZh: nameZh.trim(),
          nameEn: nameEn.trim(),
          status,
        })
      }
      toast.success(t('common.saved'))
      onSaved()
      onClose()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={editing ? t('org.editTeam') : t('org.createTeam')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? t('common.busy') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.code')} required>
          <Input value={code} onChange={(event) => setCode(event.target.value)} disabled={!!editing} />
        </Field>
        <Field label={t('common.nameZh')} required>
          <Input value={nameZh} onChange={(event) => setNameZh(event.target.value)} />
        </Field>
        <Field label={t('common.nameEn')}>
          <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">{t('common.statusValue.active')}</option>
            <option value="inactive">{t('common.statusValue.inactive')}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

function AddMemberModal({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const candidates = useAsync(() => api.teamCandidates(team.id), [team.id])
  const [userId, setUserId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!userId || busy) return
    setBusy(true)
    try {
      await api.addTeamMember(team.id, userId)
      toast.success(t('common.saved'))
      onSaved()
      onClose()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('org.addMember')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!userId || busy} onClick={() => void add()}>
            {busy ? t('common.busy') : t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-400">{t('org.teamMemberHint')}</p>
      {candidates.loading ? (
        <LoadingBlock label={t('common.loading')} />
      ) : candidates.error ? (
        <ErrorBlock error={candidates.error} onRetry={candidates.reload} retryLabel={t('common.retry')} />
      ) : !candidates.data || candidates.data.length === 0 ? (
        <EmptyBlock label={t('org.noCandidates')} icon="users" />
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {candidates.data.map((candidate) => (
            <label key={candidate.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="team-candidate"
                checked={userId === candidate.id}
                onChange={() => setUserId(candidate.id)}
              />
              {localizedUser(candidate, locale)}
              <span className="text-xs text-slate-400">{candidate.email}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}

function AddDepartmentMemberModal({
  department,
  onClose,
  onSaved,
}: {
  department: Department
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const candidates = useAsync(() => api.departmentCandidates(department.id), [department.id])
  const [userId, setUserId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!userId || busy) return
    setBusy(true)
    try {
      await api.addDepartmentMember(department.id, userId)
      toast.success(t('common.saved'))
      onSaved()
      onClose()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('org.addDepartmentMember')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!userId || busy} onClick={() => void add()}>
            {busy ? t('common.busy') : t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-400">{t('org.departmentMemberHint')}</p>
      {candidates.loading ? (
        <LoadingBlock label={t('common.loading')} />
      ) : candidates.error ? (
        <ErrorBlock error={candidates.error} onRetry={candidates.reload} retryLabel={t('common.retry')} />
      ) : !candidates.data || candidates.data.length === 0 ? (
        <EmptyBlock label={t('org.noCandidates')} icon="users" />
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {candidates.data.map((candidate) => (
            <label key={candidate.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="department-candidate"
                checked={userId === candidate.id}
                onChange={() => setUserId(candidate.id)}
              />
              {localizedUser(candidate, locale)}
              <span className="text-xs text-slate-400">{candidate.email}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}

function VacationModal({
  teamId,
  member,
  onClose,
  onSaved,
}: {
  teamId: number
  member: TeamMember
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const toast = useToast()
  const [start, setStart] = useState<string | null>(member.vacation?.startDate ?? null)
  const [end, setEnd] = useState<string | null>(member.vacation?.endDate ?? null)
  const [autoReplyText, setAutoReplyText] = useState(member.vacation?.autoReplyText ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!start || !end || busy) return
    setBusy(true)
    try {
      await api.setVacation(teamId, member.user.id, {
        startDate: start,
        endDate: end,
        autoReplyText: autoReplyText.trim() || undefined,
      })
      toast.success(t('common.saved'))
      onSaved()
      onClose()
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('org.vacation.set')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!start || !end || busy} onClick={() => void save()}>
            {busy ? t('common.busy') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <RangeCalendar
            start={start}
            end={end}
            onSelect={(nextStart, nextEnd) => {
              setStart(nextStart)
              setEnd(nextEnd)
            }}
          />
        </div>
        <Field label={t('org.vacation.autoReply')}>
          <Textarea
            value={autoReplyText}
            onChange={(event) => setAutoReplyText(event.target.value)}
            placeholder={t('org.vacation.autoReplyPlaceholder')}
          />
        </Field>
        <p className="text-xs text-slate-400">{t('org.vacation.autoReplyHint')}</p>
      </div>
    </Modal>
  )
}
