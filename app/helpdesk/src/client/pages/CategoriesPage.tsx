import { useState } from 'react'
import { api, fetchAllPages } from '../domain/api'
import { errorText, localizedName, statusText } from '../domain/format'
import { useAsync } from '../domain/hooks'
import { TICKET_TYPES, type AdminCategory, type CategoryOption, type SubCategoryOption, type TicketType } from '../domain/types'
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

/** 分类目录（需求 §6.7）：一级分类 CRUD + 二级分类管理；分类不含任何分配字段 */
export function CategoriesPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const categories = useAsync(() => api.adminCategories(page), [page, version])
  // 二级分类管理数据源：业务用户可见的分类下拉（已过滤系统骨架分类）
  const options = useAsync(() => api.categoryOptions(), [version])
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null)
  const [subCategoryFor, setSubCategoryFor] = useState<CategoryOption | null>(null)

  const optionOf = (categoryId: number): CategoryOption | null =>
    (options.data ?? []).find((option) => option.id === categoryId) ?? null

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('admin.categories.title')}</h1>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('admin.categories.create')}
        </Button>
      </header>

      {categories.loading && !categories.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : categories.error ? (
        <ErrorBlock error={categories.error} onRetry={categories.reload} retryLabel={t('common.retry')} />
      ) : categories.data && categories.data.items.length === 0 ? (
        <EmptyBlock label={t('admin.categories.empty')} icon="tag" />
      ) : categories.data ? (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>{t('common.code')}</Th>
                <Th>{t('common.nameZh')}</Th>
                <Th>{t('common.nameEn')}</Th>
                <Th>{t('common.department')}</Th>
                <Th>{t('admin.categories.ticketType')}</Th>
                <Th>{t('admin.categories.sortOrder')}</Th>
                <Th>{t('common.status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {categories.data.items.map((category) => (
                <tr key={category.id}>
                  <Td className="font-mono text-xs text-slate-500">{category.code}</Td>
                  <Td>{category.nameZh}</Td>
                  <Td className="text-slate-500">{category.nameEn || '—'}</Td>
                  <Td>{localizedName(category.department, locale)}</Td>
                  <Td>{t(`common.ticketType.${category.ticketType}`)}</Td>
                  <Td className="text-slate-500">{category.sortOrder}</Td>
                  <Td>{statusText(t, category.status)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button onClick={() => setSubCategoryFor(optionOf(category.id))}>{t('admin.categories.subCategories')}</Button>
                      <Button icon="edit" onClick={() => setEditing(category)}>
                        {t('common.edit')}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination
            page={categories.data.page}
            pageSize={categories.data.pageSize}
            total={categories.data.total}
            unit={t('common.items')}
            onPage={setPage}
          />
        </>
      ) : null}

      {editing && (
        <CategoryModal category={editing} onClose={() => setEditing(null)} onSaved={() => setVersion((v) => v + 1)} />
      )}
      {subCategoryFor && (
        <SubCategoryModal
          category={subCategoryFor}
          onClose={() => setSubCategoryFor(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}

function CategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: AdminCategory | 'new'
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const editing = typeof category === 'object' ? category : null
  const departments = useAsync(() => fetchAllPages((page) => api.departments(page)), [])
  const [code, setCode] = useState(editing?.code ?? '')
  const [nameZh, setNameZh] = useState(editing?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '')
  const [departmentId, setDepartmentId] = useState<number | ''>(editing?.department?.id ?? '')
  const [ticketType, setTicketType] = useState<TicketType>(editing?.ticketType ?? 'service_request')
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 0))
  const [status, setStatus] = useState(editing?.status ?? 'active')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    if (!code.trim() || !nameZh.trim()) {
      toast.error(t('form.validation.missing'))
      return
    }
    const order = Number(sortOrder)
    if (!Number.isFinite(order)) {
      toast.error(t('form.validation.missing'))
      return
    }
    setBusy(true)
    try {
      const body = {
        code: code.trim(),
        nameZh: nameZh.trim(),
        nameEn: nameEn.trim(),
        departmentId: departmentId || undefined,
        ticketType,
        sortOrder: order,
        status,
      }
      if (editing) await api.updateCategory(editing.id, body)
      else await api.createCategory(body)
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
      title={editing ? t('admin.categories.edit') : t('admin.categories.create')}
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
        <Field label={t('common.department')}>
          <Select value={departmentId} onChange={(event) => setDepartmentId(Number(event.target.value) || '')}>
            <option value="">—</option>
            {(departments.data ?? []).map((department) => (
              <option key={department.id} value={department.id}>
                {localizedName(department, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.categories.ticketType')} required>
          <Select value={ticketType} onChange={(event) => setTicketType(event.target.value as TicketType)}>
            {TICKET_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`common.ticketType.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.categories.sortOrder')}>
          <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">{t('common.statusValue.active')}</option>
            <option value="inactive">{t('common.statusValue.inactive')}</option>
          </Select>
        </Field>
        <p className="text-xs text-slate-400">{t('admin.categories.noAssignFields')}</p>
      </div>
    </Modal>
  )
}

function SubCategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: CategoryOption
  onClose: () => void
  onSaved: () => void
}) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const options = useAsync(() => api.categoryOptions(), [version])
  const current = (options.data ?? []).find((option) => option.id === category.id) ?? category
  const subCategories = current.subCategories ?? []
  const [editingSub, setEditingSub] = useState<SubCategoryOption | 'new' | null>(null)

  return (
    <Modal open title={`${t('admin.categories.subCategories')} · ${localizedName(category, locale)}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {t('common.subCategory')}（{subCategories.length}）
          </span>
          <Button icon="plus" onClick={() => setEditingSub('new')}>
            {t('admin.categories.createSub')}
          </Button>
        </div>
        {subCategories.length === 0 ? (
          <EmptyBlock label={t('admin.categories.subEmpty')} icon="tag" />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>{t('common.code')}</Th>
                <Th>{t('common.nameZh')}</Th>
                <Th>{t('common.nameEn')}</Th>
                <Th>{t('admin.categories.sortOrder')}</Th>
                <Th>{t('common.status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {subCategories.map((sub) => (
                <tr key={sub.id}>
                  <Td className="font-mono text-xs text-slate-500">{sub.code}</Td>
                  <Td>{sub.nameZh}</Td>
                  <Td className="text-slate-500">{sub.nameEn || '—'}</Td>
                  <Td className="text-slate-500">{sub.sortOrder ?? 0}</Td>
                  <Td>{statusText(t, sub.status ?? 'active')}</Td>
                  <Td>
                    <Button icon="edit" onClick={() => setEditingSub(sub)}>
                      {t('common.edit')}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
        {editingSub && (
          <SubCategoryForm
            category={category}
            sub={editingSub}
            onDone={(saved) => {
              setEditingSub(null)
              if (saved) setVersion((value) => value + 1)
            }}
          />
        )}
      </div>
    </Modal>
  )
}

function SubCategoryForm({
  category,
  sub,
  onDone,
}: {
  category: CategoryOption
  sub: SubCategoryOption | 'new'
  onDone: (saved: boolean) => void
}) {
  const t = usePlatformText()
  const toast = useToast()
  const editing = typeof sub === 'object' ? sub : null
  const [code, setCode] = useState(editing?.code ?? '')
  const [nameZh, setNameZh] = useState(editing?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '')
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 0))
  const [status, setStatus] = useState(editing?.status ?? 'active')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    if (!code.trim() || !nameZh.trim()) {
      toast.error(t('form.validation.missing'))
      return
    }
    const order = Number(sortOrder)
    if (!Number.isFinite(order)) {
      toast.error(t('form.validation.missing'))
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await api.updateSubCategory(editing.id, {
          code: code.trim(),
          nameZh: nameZh.trim(),
          nameEn: nameEn.trim(),
          categoryId: category.id,
          sortOrder: order,
          status,
        })
      } else {
        await api.createSubCategory({
          code: code.trim(),
          nameZh: nameZh.trim(),
          nameEn: nameEn.trim(),
          categoryId: category.id,
          sortOrder: order,
          status,
        })
      }
      toast.success(t('common.saved'))
      onDone(true)
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <h4 className="text-sm font-semibold text-slate-700">
        {editing ? t('admin.categories.editSub') : t('admin.categories.createSub')}
      </h4>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('common.code')} required>
          <Input value={code} onChange={(event) => setCode(event.target.value)} disabled={!!editing} />
        </Field>
        <Field label={t('common.nameZh')} required>
          <Input value={nameZh} onChange={(event) => setNameZh(event.target.value)} />
        </Field>
        <Field label={t('common.nameEn')}>
          <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </Field>
        <Field label={t('admin.categories.sortOrder')}>
          <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">{t('common.statusValue.active')}</option>
            <option value="inactive">{t('common.statusValue.inactive')}</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone(false)}>{t('common.cancel')}</Button>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {busy ? t('common.busy') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
