import { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useCurrentUser } from '../app/currentUser';
import { useCompanyOptions } from '../admin/GroupsSection';
import { GroupsSection } from '../admin/GroupsSection';
import { RulesSection } from '../admin/RulesSection';
import { CategoriesSection } from '../admin/CategoriesSection';

/**
 * 公司管理视图：绑定当前用户所在公司，提供
 * 业务组与成员设置（AC-04）、分类→业务组分配规则（AC-05）、分类维护。
 * 写操作权限由服务端校验；非管理员时给出提示并禁用写入口。
 */
export function CompanyAdminView() {
  const { users, currentUser } = useCurrentUser();
  const companies = useCompanyOptions(users);
  const [companyId, setCompanyId] = useState<number | null>(null);

  useEffect(() => {
    if (companyId === null && currentUser !== null) {
      setCompanyId(currentUser.company.id);
    }
  }, [currentUser, companyId]);

  const companyUsers = useMemo(
    () => users.filter((u) => u.company.id === companyId),
    [users, companyId],
  );

  const selectedCompany =
    companies.find((c) => c.id === companyId) ??
    (currentUser !== null ? { id: currentUser.company.id, name: currentUser.company.name } : null);

  const isAdmin =
    currentUser !== null &&
    selectedCompany !== null &&
    currentUser.isCompanyAdmin &&
    currentUser.company.id === selectedCompany.id;

  if (currentUser === null) {
    return <p className="muted">用户未就绪。</p>;
  }

  return (
    <div className="page admin-page">
      <div className="page-toolbar">
        <h2 className="page-title">
          <Building2 size={17} className="muted-icon" aria-hidden /> 公司管理
        </h2>
        <div className="toolbar-spacer" />
        <label className="filter-field">
          <span className="filter-label">公司</span>
          <select
            className="select"
            value={companyId ?? ''}
            onChange={(e) => setCompanyId(Number(e.target.value))}
            aria-label="选择公司"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!isAdmin && (
        <div className="notice notice-warn">
          当前用户不是 {selectedCompany !== null ? selectedCompany.name : '该公司'} 的管理员：以下配置仅可查看，
          写操作将被服务端拒绝。可在顶栏切换到该公司的管理员用户进行管理。
        </div>
      )}
      {selectedCompany !== null && (
        <>
          <GroupsSection
            companyId={selectedCompany.id}
            companyName={selectedCompany.name}
            companyUsers={companyUsers}
            isAdmin={isAdmin}
          />
          <RulesSection
            companyId={selectedCompany.id}
            companyName={selectedCompany.name}
            isAdmin={isAdmin}
          />
        </>
      )}
      <CategoriesSection />
    </div>
  );
}
