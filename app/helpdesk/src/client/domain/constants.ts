// 任务级常量。灵基智能体入口 URL 在需求与契约中均未给出，
// 按任务约定实现为常量，待产品给出正式地址后替换。
export const LINGEE_AGENT_URL = 'https://lingee.example.com/agent'

/** 幂等键存储前缀：草稿创建/提交期间持久化，提交完成后清除 */
export const IDEMPOTENCY_KEY_PREFIX = 'helpdesk.idem.'
