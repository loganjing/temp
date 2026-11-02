import { sampleSession } from './sampleSession.js'

/**
 * 数据访问边界 — 唯一的数据出口。
 * 页面只通过此模块读取会话轨迹，不直接引用示例数据常量。
 * 在数据装载处进行一次性边界校验，渲染层不做兜底推断。
 */

const VALID_TYPES = ['user', 'model', 'tool']

/**
 * 校验会话轨迹数据的完整性。
 * 规则：首步必须为用户输入、末步必须为模型最终回复；
 *       工具调用步骤必须带工具名称；类型必须合法。
 * @param {object} session
 * @returns {object} 带 steps（含派生编号）的会话对象
 */
function validateAndEnrich(session) {
  if (!session || !Array.isArray(session.steps) || session.steps.length < 3) {
    throw new Error('会话轨迹至少需要 3 个步骤')
  }

  const steps = session.steps.map((step, index) => {
    if (!VALID_TYPES.includes(step.type)) {
      throw new Error(`第 ${index + 1} 步类型无效：${step.type}`)
    }

    if (step.type === 'tool' && !step.toolName) {
      throw new Error(`第 ${index + 1} 步为工具调用但缺少工具名称`)
    }

    return {
      seq: index + 1,
      type: step.type,
      summary: step.summary,
      content: step.content || null,
      toolName: step.toolName || null
    }
  })

  if (steps[0].type !== 'user') {
    throw new Error('首步必须为用户输入')
  }
  if (steps[steps.length - 1].type !== 'model') {
    throw new Error('末步必须为模型最终回复')
  }

  return {
    id: session.id,
    title: session.title,
    steps
  }
}

let cachedSession = null

/**
 * 获取当前会话的轨迹（只读）。
 * @returns {object} 带 id、title、steps 的会话对象
 */
export function getSessionTrajectory() {
  if (!cachedSession) {
    cachedSession = validateAndEnrich(sampleSession)
  }
  return cachedSession
}
