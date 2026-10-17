import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiErrorMessage, createCategory, listCategories } from '../api/client';
import type { Category } from '../api/types';
import { useCurrentUser } from '../app/currentUser';
import { useToast } from '../app/toast';
import { ErrorBanner, SkeletonRows } from '../components/common';

/** 问题分类维护（全局分类列表，供创建工单与规则引用）。POST 需任意公司管理员。 */
export function CategoriesSection() {
  const { currentUser } = useCurrentUser();
  const { pushToast } = useToast();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isAdmin = currentUser !== null && currentUser.isCompanyAdmin;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listCategories()
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const reload = () => setReloadTick((n) => n + 1);

  const addCategory = async () => {
    const name = newName.trim();
    if (name.length === 0) {
      setFormError('请填写分类名称');
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const created = await createCategory({ name });
      pushToast('success', `分类「${created.name}」已添加`);
      setNewName('');
      reload();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="admin-section">
      <h3 className="section-title">问题分类</h3>
      <p className="muted small">
        全局维护的问题分类，供创建工单时选择与分配规则引用（新增需要任意公司管理员身份）。
      </p>
      <div className="inline-form">
        <input
          className="input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新分类名称（如：网络问题）"
          disabled={creating || !isAdmin}
          aria-label="新分类名称"
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void addCategory()}
          disabled={creating || !isAdmin || newName.trim().length === 0}
          title={isAdmin ? undefined : '需要公司管理员身份'}
        >
          <Plus size={14} />
          {creating ? '添加中…' : '添加分类'}
        </button>
      </div>
      {formError !== null && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      {error !== null && <ErrorBanner message={`分类加载失败：${error}`} onRetry={reload} />}
      {categories === null && error === null && (
        <div className="card">
          <SkeletonRows rows={2} cols={5} />
        </div>
      )}
      {categories !== null && categories.length === 0 && (
        <p className="muted small">暂无分类。请先添加分类，再创建工单或配置分配规则。</p>
      )}
      {categories !== null && categories.length > 0 && (
        <div className="category-chips">
          {categories.map((c) => (
            <span key={c.id} className="chip chip-category">
              {c.name}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
