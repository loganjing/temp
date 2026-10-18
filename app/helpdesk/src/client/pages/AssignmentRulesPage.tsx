import { useRef, useState, type FormEvent } from 'react'
import { api, fetchAllPages } from '../domain/api'
import { errorText, localizedName } from '../domain/format'
import { useAsync } from '../domain/hooks'
import { csvToObjects, parseCsv } from '../domain/csv'
import type { AdminCategory, AssignmentRule, AssignmentRuleRow, Ref } from '../domain/types'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  TableShell,
  Td,
  Th,
  useToast,
} from '../components/ui'
import { useLocale, usePlatformText } from '../platform/i18n'

const RULE_CSV_COLUMNS = ['categoryCode', 'teamCodes']

/** 分配规则管理（需求 §6.8）：一级分类 → 目标 Team（多选），搜索/CSV/未配置提醒 */
export function AssignmentRulesPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [version, setVersion] = useState(0)
  const rules = useAsync(() => api.assignmentRules(q || undefined), [q, version])
  const [editing, setEditing] = useState<AssignmentRule | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRule | null>(null)
  const [importRows, setImportRows] = useState<AssignmentRuleRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setQ(searchInput.trim())
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return
    try {
      const records = csvToObjects(parseCsv(await file.text()), RULE_CSV_COLUMNS)
      if (!records || records.length === 0) {
        toast.error(t('csv.invalidFile'))
        return
      }
      setImportRows(
        records.map((record) => ({
          categoryCode: record.categoryCode,
          teamCodes: record.teamCodes
            .split(';')
            .map((code) => code.trim())
            .filter(Boolean),
        })),
      )
    } catch {
      toast.error(t('csv.invalidFile'))
    }
  }

  async function confirmImport() {
    if (!importRows || importing) return
    setImporting(true)
    try {
      await api.importRules(importRows)
      toast.success(t('csv.done'))
      setImportRows(null)
      setVersion((value) => value + 1)
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setImporting(false)
    }
  }

  async function removeRule() {
    if (!deleteTarget) return
    try {
      await api.deleteRule(deleteTarget.id)
      toast.success(t('common.saved'))
      setVersion((value) => value + 1)
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setDeleteTarget(null)
    }
  }

  // 导出不受当前搜索过滤影响，始终全量（契约 §5）
  function exportCsv() {
    api.exportRulesCsv().catch((reason: unknown) => toast.error(errorText(reason, t('common.error.generic'))))
  }

  const unconfigured = rules.data?.unconfiguredCategories ?? []

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('rules.title')}</h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              void onImportFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <Button icon="upload" onClick={() => fileInputRef.current?.click()}>
            {t('csv.import')}
          </Button>
          <Button icon="download" onClick={exportCsv}>
            {t('csv.export')}
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('rules.create')}
          </Button>
        </div>
      </header>

      <form className="flex items-center gap-2" onSubmit={submitSearch}>
        <div className="w-72">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('rules.searchPlaceholder')}
          />
        </div>
        <Button type="submit" icon="search">
          {t('common.search')}
        </Button>
        {q && (
          <Button
            icon="x"
            onClick={() => {
              setQ('')
              setSearchInput('')
            }}
          >
            {t('tickets.filter.clear')}
          </Button>
        )}
      </form>

      {unconfigured.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">{t('rules.unconfigured')}</p>
          <p className="mt-1">{unconfigured.map((category) => localizedName(category, locale)).join('、')}</p>
        </div>
      )}

      {rules.loading && !rules.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : rules.error ? (
        <ErrorBlock error={rules.error} onRetry={rules.reload} retryLabel={t('common.retry')} />
      ) : rules.data && rules.data.items.length === 0 ? (
        <EmptyBlock label={t('rules.empty')} icon="flow" />
      ) : rules.data ? (
        <TableShell>
          <thead>
            <tr>
              <Th>{t('common.category')}</Th>
              <Th>{t('common.department')}</Th>
              <Th>{t('org.teams')}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rules.data.items.map((rule) => (
              <tr key={rule.id}>
                <Td>{localizedName(rule.category, locale)}</Td>
                <Td>{localizedName(rule.department, locale)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {rule.teams.map((team) => (
                      <span key={team.id} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                        {localizedName(team, locale)}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button icon="edit" onClick={() => setEditing(rule)}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="danger" icon="trash" onClick={() => setDeleteTarget(rule)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      ) : null}

      {editing && (
        <RuleModal rule={editing} unconfigured={unconfigured} onClose={() => setEditing(null)} onSaved={() => setVersion((v) => v + 1)} />
      )}

      <Modal
        open={!!deleteTarget}
        title={t('rules.delete')}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => void removeRule()}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('rules.deleteConfirm', { category: deleteTarget ? localizedName(deleteTarget.category, locale) : '' })}</p>
      </Modal>

      <Modal
        open={!!importRows}
        title={t('csv.preview')}
        onClose={() => setImportRows(null)}
        wide
        footer={
          <>
            <Button onClick={() => setImportRows(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={importing} onClick={() => void confirmImport()}>
              {importing ? t('common.busy') : t('csv.confirm')}
            </Button>
          </>
        }
      >
        {importRows && (
          <>
            <p className="mb-3 text-sm text-slate-500">{t('csv.rows', { count: importRows.length })}</p>
            <TableShell>
              <thead>
                <tr>
                  <Th>{RULE_CSV_COLUMNS[0]}</Th>
                  <Th>{RULE_CSV_COLUMNS[1]}</Th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, index) => (
                  <tr key={index}>
                    <Td className="font-mono text-xs text-slate-500">{row.categoryCode}</Td>
                    <Td className="font-mono text-xs text-slate-500">{row.teamCodes.join(';')}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </>
        )}
      </Modal>
    </div>
  )
}

function RuleModal({
  rule,
  unconfigured,
  onClose,
  onSaved,
}: {
  rule: AssignmentRule | 'new'
  unconfigured: Ref[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const editing = typeof rule === 'object' ? rule : null
  // 编辑时分类固定；新建时仅列出未配置分类，避免一分类多规则
  const selectable: Ref[] = typeof rule === 'object' ? [rule.category] : unconfigured
  // 解析所选分类的所属部门（用于前端限定目标 Team 范围，与后端同一校验口径）
  const allCategories = useAsync(() => fetchAllPages((page) => api.adminCategories(page)), [])
  const [categoryId, setCategoryId] = useState<number | ''>(editing?.category.id ?? '')
  const selectedCategory: Ref | null = selectable.find((category) => category.id === categoryId) ?? null
  const departmentId = editing
    ? editing.department.id
    : (allCategories.data ?? []).find((category: AdminCategory) => category.id === categoryId)?.department?.id ?? null
  const teams = useAsync(
    () => (departmentId ? api.departmentTeams(departmentId) : Promise.resolve([])),
    [departmentId],
  )
  const [teamIds, setTeamIds] = useState<number[]>((editing?.teams ?? []).map((team) => team.id))
  const [busy, setBusy] = useState(false)

  function toggleTeam(id: number) {
    setTeamIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  async function save() {
    if (busy) return
    if (!categoryId || teamIds.length === 0) {
      toast.error(t('rules.teamRequired'))
      return
    }
    setBusy(true)
    try {
      if (editing) await api.updateRule(editing.id, teamIds)
      else await api.createRule(categoryId, teamIds)
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
      title={editing ? t('rules.edit') : t('rules.create')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !selectedCategory} onClick={() => void save()}>
            {busy ? t('common.busy') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.category')} required>
          <Select
            value={categoryId}
            onChange={(event) => setCategoryId(Number(event.target.value) || '')}
            disabled={!!editing}
          >
            <option value="">—</option>
            {selectable.map((category) => (
              <option key={category.id} value={category.id}>
                {localizedName(category, locale)}
              </option>
            ))}
          </Select>
        </Field>
        {selectedCategory ? (
          <Field label={t('org.teams')} required>
            {teams.loading ? (
              <LoadingBlock label={t('common.loading')} />
            ) : teams.error ? (
              <ErrorBlock error={teams.error} onRetry={teams.reload} retryLabel={t('common.retry')} />
            ) : !teams.data || teams.data.length === 0 ? (
              <EmptyBlock label={t('rules.noTeams')} icon="users" />
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {teams.data.map((team) => (
                  <label key={team.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={teamIds.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                    />
                    {localizedName(team, locale)}
                    <span className="font-mono text-xs text-slate-400">{team.code}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
        ) : (
          <p className="text-sm text-slate-400">{t('rules.selectCategoryFirst')}</p>
        )}
        <p className="text-xs text-slate-400">{t('rules.teamHint')}</p>
      </div>
    </Modal>
  )
}
