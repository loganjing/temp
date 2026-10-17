import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { apiErrorMessage, createAssignmentRule, listAssignmentRules, listBusinessGroups, listCategories } from '../api/client';
import type { AssignmentRule, BusinessGroup, Category } from '../api/types';
import { useToast } from '../app/toast';
import { ErrorBanner, SkeletonRows } from '../components/common';

interface RulesSectionProps {
  companyId: number;
  companyName: string;
  isAdmin: boolean;
}

/** 「分类 → 业务组」自动分配规则配置（AC-05）。 */
export function RulesSection({ companyId, companyName, isAdmin }: RulesSectionProps) {
  const { pushToast } = useToast();
  const [rules, setRules] = useState<AssignmentRule[] | null>(null);
  const [groups, setGroups] = useState<BusinessGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [groupId, setGroupId] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listAssignmentRules(companyId),
      listBusinessGroups(companyId),
      listCategories(),
    ])
      .then(([rulesList, groupList, categoryList]) => {
        if (cancelled) return;
        setRules(rulesList);
        setGroups(groupList);
        setCategories(categoryList);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reloadTick]);

  const reload = () => setReloadTick((n) => n + 1);

  const addRule = async () => {
    if (categoryId === '' || groupId === '') {
      setFormError('请同时选择分类与业务组');
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const rule = await createAssignmentRule(companyId, { categoryId, groupId });
      pushToast(
        'success',
        `规则已配置：分类「${rule.category.name}」→ 业务组「${rule.group.name}」，该分类新工单将自动分配`,
      );
      setCategoryId('');
      setGroupId('');
      reload();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const categoryOptions = categories;
  const hasConflict = (categoryId !== '' && rules?.some((r) => r.category.id === categoryId)) ?? false;

  return (
    <section className="admin-section">
      <h3 className="section-title">分类分配规则</h3>
      <p className="muted small">
        配置后，{companyName} 新建的命中分类工单将自动分配到对应业务组并直接进入「待处理」。
      </p>
      <div className="rule-form">
        <select
          className="select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={creating || !isAdmin}
          aria-label="选择分类"
        >
          <option value="">选择分类</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronRight size={16} className="muted-icon" aria-hidden />
        <select
          className="select"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={creating || !isAdmin || groups.length === 0}
          aria-label="选择业务组"
        >
          <option value="">{groups.length === 0 ? '暂无业务组' : '选择业务组'}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void addRule()}
          disabled={creating || !isAdmin || categoryId === '' || groupId === ''}
          title={isAdmin ? undefined : '需要该公司管理员权限'}
        >
          {creating ? '配置中…' : '添加规则'}
        </button>
      </div>
      {hasConflict && (
        <p className="muted small">提示：该分类已存在规则，重复提交将被服务端拒绝。</p>
      )}
      {formError !== null && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      {loading && (
        <div className="card">
          <SkeletonRows rows={2} cols={3} />
        </div>
      )}
      {error !== null && <ErrorBanner message={`分配规则加载失败：${error}`} onRetry={reload} />}
      {rules !== null && rules.length === 0 && !loading && (
        <p className="muted small">该公司尚未配置分配规则；未命中规则的新工单将停留「待分配」等待人工分配。</p>
      )}
      {rules !== null && rules.length > 0 && (
        <ul className="rule-list">
          {rules.map((rule) => (
            <li key={rule.id} className="rule-row">
              <span className="rule-category" title={rule.category.name}>
                {rule.category.name}
              </span>
              <ChevronRight size={14} className="muted-icon" aria-hidden />
              <span className="rule-group" title={rule.group.name}>
                {rule.group.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
