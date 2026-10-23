import type { ReactNode, KeyboardEvent } from 'react';
import { Search, RotateCcw } from 'lucide-react';

export interface FilterConfig {
  name: string;
  label: string;
  type: 'text' | 'select' | 'date';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onSearch: () => void;
  onReset?: () => void;
  extra?: ReactNode;
}

export function FilterBar({ filters, values, onChange, onSearch, onReset, extra }: FilterBarProps) {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') onSearch();
  }

  return (
    <div className="filter-bar">
      <div className="filter-bar__fields">
        {filters.map((f) => (
          <div key={f.name} className="filter-bar__field">
            <label className="filter-bar__label">{f.label}</label>
            {f.type === 'select' ? (
              <select
                className="filter-bar__input"
                value={values[f.name] || ''}
                onChange={(e) => onChange(f.name, e.target.value)}
              >
                <option value="">全部</option>
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'date' ? (
              <input
                type="date"
                className="filter-bar__input"
                value={values[f.name] || ''}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className="filter-bar__input"
                placeholder={f.placeholder || `输入${f.label}`}
                value={values[f.name] || ''}
                onChange={(e) => onChange(f.name, e.target.value)}
                onKeyDown={handleKeyDown}
              />
            )}
          </div>
        ))}
        <div className="filter-bar__actions">
          <button className="btn btn--primary btn--sm" onClick={onSearch}>
            <Search size={16} />
            <span>筛选</span>
          </button>
          {onReset && (
            <button className="btn btn--secondary btn--sm" onClick={onReset}>
              <RotateCcw size={16} />
              <span>重置</span>
            </button>
          )}
        </div>
      </div>
      {extra && <div className="filter-bar__extra">{extra}</div>}
    </div>
  );
}
