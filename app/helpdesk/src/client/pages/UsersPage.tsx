import { useRef, useState } from 'react'
import { api } from '../domain/api'
import { errorText, localizedName, statusText } from '../domain/format'
import { useAsync } from '../domain/hooks'
import { csvToObjects, parseCsv } from '../domain/csv'
import { ROLES, type CompanyNode, type Role, type UserAdminRow, type UserImportRow } from '../domain/types'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Pagination,
  Select,
  TableShell,
  Td,
  Th,
  useToast,
} from '../components/ui'
import { useLocale, usePlatformText } from '../platform/i18n'

const USER_CSV_COLUMNS = ['email', 'nameZh', 'nameEn', 'phone', 'role', 'companyCode', 'status']

/** 用户管理（需求 §6.10）：分页列表 + 新建/编辑 + CSV 导入导出 */
export function UsersPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const users = useAsync(() => api.adminUsers(page), [page, version])
  const [editing, setEditing] = useState<UserAdminRow | 'new' | null>(null)
  const [importRows, setImportRows] = useState<UserImportRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function onImportFile(file: File | undefined) {
    if (!file) return
    try {
      const records = csvToObjects(parseCsv(await file.text()), USER_CSV_COLUMNS)
      if (!records || records.length === 0) {
        toast.error(t('csv.invalidFile'))
        return
      }
      setImportRows(
        records.map((record) => ({
          email: record.email,
          nameZh: record.nameZh,
          nameEn: record.nameEn,
          phone: record.phone,
          role: record.role,
          companyCode: record.companyCode,
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
      await api.importUsers(importRows)
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
    api.exportUsersCsv().catch((reason: unknown) => toast.error(errorText(reason, t('common.error.generic'))))
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('admin.users.title')}</h1>
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
            {t('admin.users.create')}
          </Button>
        </div>
      </header>

      {users.loading && !users.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : users.error ? (
        <ErrorBlock error={users.error} onRetry={users.reload} retryLabel={t('common.retry')} />
      ) : users.data && users.data.items.length === 0 ? (
        <EmptyBlock label={t('admin.users.empty')} icon="users" />
      ) : users.data ? (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>{t('admin.users.email')}</Th>
                <Th>{t('common.nameZh')}</Th>
                <Th>{t('common.nameEn')}</Th>
                <Th>{t('admin.users.phone')}</Th>
                <Th>{t('admin.users.role')}</Th>
                <Th>{t('admin.users.company')}</Th>
                <Th>{t('common.status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((user) => (
                <tr key={user.id}>
                  <Td className="text-slate-500">{user.email}</Td>
                  <Td>{user.nameZh || '—'}</Td>
                  <Td>{user.nameEn || '—'}</Td>
                  <Td className="text-slate-500">{user.phone || '—'}</Td>
                  <Td>{t(`role.${user.role}`)}</Td>
                  <Td>{localizedName(user.company, locale)}</Td>
                  <Td>{statusText(t, user.status)}</Td>
                  <Td>
                    <Button icon="edit" onClick={() => setEditing(user)}>
                      {t('common.edit')}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination
            page={users.data.page}
            pageSize={users.data.pageSize}
            total={users.data.total}
            unit={t('common.items')}
            onPage={setPage}
          />
        </>
      ) : null}

      {editing && <UserModal user={editing} onClose={() => setEditing(null)} onSaved={() => setVersion((v) => v + 1)} />}

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
                  {USER_CSV_COLUMNS.map((column) => (
                    <Th key={column}>{column}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, index) => (
                  <tr key={index}>
                    <Td className="text-slate-500">{row.email}</Td>
                    <Td>{row.nameZh}</Td>
                    <Td>{row.nameEn}</Td>
                    <Td className="text-slate-500">{row.phone || '—'}</Td>
                    <Td>{row.role}</Td>
                    <Td className="text-slate-500">{row.companyCode}</Td>
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

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserAdminRow | 'new'
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const editing = typeof user === 'object' ? user : null
  const companies = useAsync(() => api.companies(), [])
  const [email, setEmail] = useState(editing?.email ?? '')
  const [nameZh, setNameZh] = useState(editing?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [role, setRole] = useState<Role>(editing?.role ?? 'requester')
  const [companyId, setCompanyId] = useState<number | ''>(editing?.company?.id ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'active')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    if (!email.trim() || !nameZh.trim() || !companyId) {
      toast.error(t('form.validation.missing'))
      return
    }
    setBusy(true)
    try {
      const body = {
        email: email.trim(),
        nameZh: nameZh.trim(),
        nameEn: nameEn.trim(),
        phone: phone.trim() || undefined,
        role,
        companyId,
        status,
        password: password || undefined,
      }
      if (editing) await api.updateUser(editing.id, body)
      else await api.createUser(body)
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
      title={editing ? t('admin.users.edit') : t('admin.users.create')}
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
        <Field label={t('admin.users.email')} required>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={!!editing} />
        </Field>
        <Field label={t('common.nameZh')} required>
          <Input value={nameZh} onChange={(event) => setNameZh(event.target.value)} />
        </Field>
        <Field label={t('common.nameEn')}>
          <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </Field>
        <Field label={t('admin.users.phone')}>
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </Field>
        <Field label={t('admin.users.role')} required>
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {t(`role.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.users.company')} required>
          <Select value={companyId} onChange={(event) => setCompanyId(Number(event.target.value) || '')}>
            <option value="">—</option>
            {flattenCompanies(companies.data ?? []).map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'\u00A0'.repeat(depth * 2)}
                {localizedName(node, locale)}（{node.code}）
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">{t('common.statusValue.active')}</option>
            <option value="inactive">{t('common.statusValue.inactive')}</option>
          </Select>
        </Field>
        <Field label={t('admin.users.password')}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={editing ? t('admin.users.passwordHint') : undefined}
          />
        </Field>
      </div>
    </Modal>
  )
}

interface CompanyFlat {
  node: CompanyNode
  depth: number
}

function flattenCompanies(nodes: CompanyNode[], depth = 0, out: CompanyFlat[] = []): CompanyFlat[] {
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.children.length > 0) flattenCompanies(node.children, depth + 1, out)
  }
  return out
}
