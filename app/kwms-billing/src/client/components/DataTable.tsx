import { type ReactNode } from 'react'
import { EmptyState, SkeletonRows } from './ui'

// 数据表格：列配置渲染、加载骨架、空态；支持复选框选择（应收明细批量重算等场景）。

export interface Column<T> {
  key: string
  title: ReactNode
  render: (row: T, index: number) => ReactNode
  width?: string
  numeric?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[] | null
  rowKey: (row: T) => string
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  selectable?: boolean
  isRowSelected?: (row: T) => boolean
  onRowSelectChange?: (row: T, selected: boolean) => void
  isRowSelectable?: (row: T) => boolean
  allSelected?: boolean
  onToggleAll?: (selected: boolean) => void
}

export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, rowKey, loading, emptyTitle = '暂无数据', emptyDescription, emptyAction } = props
  const loadingActive = loading || rows === null
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {props.selectable && (
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="全选本页"
                  checked={props.allSelected ?? false}
                  disabled={!props.onToggleAll}
                  onChange={(event) => props.onToggleAll?.(event.currentTarget.checked)}
                />
              </th>
            )}
            {columns.map((column) => (
              <th key={column.key} style={{ width: column.width }} className={column.numeric ? 'num' : undefined}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        {loadingActive ? (
          <SkeletonRows cols={columns.length + (props.selectable ? 1 : 0)} />
        ) : rows && rows.length > 0 ? (
          <tbody>
            {rows.map((row, index) => (
              <tr key={rowKey(row)}>
                {props.selectable && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label="选择该行"
                      checked={props.isRowSelected?.(row) ?? false}
                      disabled={!props.isRowSelectable || !props.isRowSelectable(row)}
                      onChange={(event) => props.onRowSelectChange?.(row, event.currentTarget.checked)}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className={column.numeric ? 'num' : undefined}>
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : (
          <tbody>
            <tr>
              <td colSpan={columns.length + (props.selectable ? 1 : 0)}>
                <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  )
}
