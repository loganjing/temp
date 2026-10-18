import { useRef, useState } from 'react'
import { api } from '../domain/api'
import { errorText, localizedName, statusText } from '../domain/format'
import { useAsync } from '../domain/hooks'
import { csvToObjects, parseCsv } from '../domain/csv'
import type { CompanyImportRow, CompanyNode } from '../domain/types'
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
import { Icon } from '../components/icons'
import { useLocale, usePlatformText } from '../platform/i18n'

const COMPANY_CSV_COLUMNS = ['code', 'parentCode', 'nameZh', 'nameEn', 'status']

/** 公司管理（需求 §6.10）：BG → 公司树形结构，编码唯一，支持导入导出 */
export function CompaniesPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const companies = useAsync(() => api.companies(), [version])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<{ node: CompanyNode | null; parentId?: number } | null>(null)
  const [importRows, setImportRows] = useState<CompanyImportRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function toggleCollapse(id: number) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return
    try {
      const records = csvToObjects(parseCsv(await file.text()), COMPANY_CSV_COLUMNS)
      if (!records || records.length === 0) {
        toast.error(t('csv.invalidFile'))
        return
      }
      setImportRows(
        records.map((record) => ({
          code: record.code,
          parentCode: record.parentCode,
          nameZh: record.nameZh,
          nameEn: record.nameEn,
          status: record.status,
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
      await api.importCompanies(importRows)
      toast.success(t('csv.done'))
      setImportRows(null)
      setVersion((value) => value + 1)
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setImporting(false)
    }
  }

  function exportCsv() {
    api.exportCompaniesCsv().catch((reason: unknown) => toast.error(errorText(reason, t('common.error.generic'))))
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('admin.companies.title')}</h1>
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
          <Button variant="primary" icon="plus" onClick={() => setModal({ node: null })}>
            {t('admin.companies.create')}
          </Button>
        </div>
      </header>

      {companies.loading && !companies.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : companies.error ? (
        <ErrorBlock error={companies.error} onRetry={companies.reload} retryLabel={t('common.retry')} />
      ) : companies.data && companies.data.length === 0 ? (
        <EmptyBlock label={t('admin.companies.empty')} icon="building" />
      ) : companies.data ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <CompanyRows
            nodes={companies.data}
            depth={0}
            collapsed={collapsed}
            onToggle={toggleCollapse}
            onEdit={(node) => setModal({ node })}
            onAddChild={(node) => setModal({ node: null, parentId: node.id })}
          />
        </div>
      ) : null}

      {modal && (
        <CompanyModal
          node={modal.node}
          parentId={modal.parentId}
          onClose={() => setModal(null)}
          onSaved={() => setVersion((value) => value + 1)}
        />
      )}

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
                  {COMPANY_CSV_COLUMNS.map((column) => (
                    <Th key={column}>{column}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, index) => (
                  <tr key={index}>
                    <Td className="text-slate-500">{row.code}</Td>
                    <Td className="text-slate-500">{row.parentCode || '—'}</Td>
                    <Td>{row.nameZh}</Td>
                    <Td>{row.nameEn}</Td>
                    <Td>{row.status}</Td>
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

function CompanyRows({
  nodes,
  depth,
  collapsed,
  onToggle,
  onEdit,
  onAddChild,
}: {
  nodes: CompanyNode[]
  depth: number
  collapsed: Set<number>
  onToggle: (id: number) => void
  onEdit: (node: CompanyNode) => void
  onAddChild: (node: CompanyNode) => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isCollapsed = collapsed.has(node.id)
        return (
          <div key={node.id}>
            <div
              className="flex items-center gap-2 border-b border-slate-100 py-1.5 pr-3 text-sm"
              style={{ paddingLeft: depth * 20 + 8 }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(node.id)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                  aria-label="toggle-company-node"
                >
                  <Icon
                    name="chevronRight"
                    className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  />
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span className="font-mono text-xs text-slate-400">{node.code}</span>
              <span className="text-slate-700">{localizedName(node, locale)}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {statusText(t, node.status)}
              </span>
              <span className="ml-auto flex gap-1">
                <Button icon="plus" onClick={() => onAddChild(node)}>
                  {t('admin.companies.addChild')}
                </Button>
                <Button icon="edit" onClick={() => onEdit(node)}>
                  {t('common.edit')}
                </Button>
              </span>
            </div>
            {hasChildren && !isCollapsed && (
              <CompanyRows
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                onEdit={onEdit}
                onAddChild={onAddChild}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function CompanyModal({
  node,
  parentId,
  onClose,
  onSaved,
}: {
  node: CompanyNode | null
  parentId?: number
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const editing = node
  const isChildCreate = parentId !== undefined
  const companies = useAsync(() => api.companies(), [])
  const [code, setCode] = useState(editing?.code ?? '')
  const [nameZh, setNameZh] = useState(editing?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '')
  const [parent, setParent] = useState<number | ''>(isChildCreate ? parentId : '')
  const [status, setStatus] = useState(editing?.status ?? 'active')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    if (!editing && !code.trim()) {
      toast.error(t('form.validation.missing'))
      return
    }
    if (!nameZh.trim()) {
      toast.error(t('form.validation.missing'))
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await api.updateCompany(editing.id, { nameZh: nameZh.trim(), nameEn: nameEn.trim(), status })
      } else {
        await api.createCompany({
          code: code.trim(),
          nameZh: nameZh.trim(),
          nameEn: nameEn.trim(),
          parentId: isChildCreate ? parentId : parent || undefined,
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
      title={editing ? t('admin.companies.edit') : isChildCreate ? t('admin.companies.addChild') : t('admin.companies.create')}
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
        {editing || isChildCreate ? (
          <Field label={t('admin.companies.parent')}>
            <Select value={isChildCreate ? parentId : editing?.id ?? ''} disabled>
              {isChildCreate && <option value={parentId}>{t('admin.companies.parentFixed')}</option>}
              {editing && <option value={editing.id}>{localizedName(editing, locale)}</option>}
            </Select>
          </Field>
        ) : (
          <Field label={t('admin.companies.parent')}>
            <Select value={parent} onChange={(event) => setParent(Number(event.target.value) || '')}>
              <option value="">{t('admin.companies.root')}</option>
              {flattenOptions(companies.data ?? []).map(({ node: option, depth }) => (
                <option key={option.id} value={option.id}>
                  {'\u00A0'.repeat(depth * 2)}
                  {localizedName(option, locale)}（{option.code}）
                </option>
              ))}
            </Select>
          </Field>
        )}
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

function flattenOptions(nodes: CompanyNode[], depth = 0, out: { node: CompanyNode; depth: number }[] = []) {
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.children.length > 0) flattenOptions(node.children, depth + 1, out)
  }
  return out
}
