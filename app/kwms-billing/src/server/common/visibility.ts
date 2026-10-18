// 应答金额字段级角色过滤策略点（技术契约第 1 节，承载需求未决事项 4）：
// 默认策略仅财务角色输出金额字段，其他角色金额字段置 null。
// 系统管理员可调整策略实现（单一承载点，不散落各序列化器）。
export interface AmountVisibilityPolicy {
  canSeeAmounts(roles: readonly string[]): boolean
}

export const defaultAmountVisibility: AmountVisibilityPolicy = {
  canSeeAmounts: (roles) => roles.includes('finance'),
}

// 依据策略输出金额值：不可见时置 null
export function amountValue(policy: AmountVisibilityPolicy, roles: readonly string[], value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return policy.canSeeAmounts(roles) ? value : null
}

// 依据策略输出金额数组整体：不可见时整组金额字段置 null
export function amountsVisible(policy: AmountVisibilityPolicy, roles: readonly string[]): boolean {
  return policy.canSeeAmounts(roles)
}
