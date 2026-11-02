/**
 * 示例会话数据集 — 模拟一次真实的 AI 会话执行流程。
 * 包含 1 条用户输入、1 条模型最终回复、6 个中间步骤（3 次模型回复 + 3 次工具调用，交替出现）。
 * 共 8 步，满足"不少于 5 个中间步骤，含至少 1 次工具调用"的基线要求。
 */
const sampleSteps = [
  {
    type: 'user',
    summary: '用户请求分析季度销售数据并生成报告',
    content: '帮我分析一下这个季度的销售数据，重点看各区域的表现，最后生成一份可视化报告。'
  },
  {
    type: 'model',
    summary: '模型确认任务并规划执行步骤',
    content: '好的，我来帮您分析本季度的销售数据。首先需要从数据库中查询销售记录，然后进行趋势分析，最后生成可视化报告。'
  },
  {
    type: 'tool',
    summary: '查询数据库中的季度销售记录',
    toolName: 'querySalesDatabase'
  },
  {
    type: 'model',
    summary: '确认数据已获取，准备进行趋势分析',
    content: '已获取到本季度共 3,200 条销售记录，接下来对各区域数据进行汇总和趋势分析。'
  },
  {
    type: 'tool',
    summary: '对销售数据进行多维度趋势分析',
    toolName: 'analyzeDataTrends'
  },
  {
    type: 'model',
    summary: '分析完成，准备生成可视化报告',
    content: '数据分析完成。华东区域销售额同比增长 18% 表现最优，西南区域略有下滑。现在为您生成可视化报告。'
  },
  {
    type: 'tool',
    summary: '生成包含图表的可可视化报告',
    toolName: 'generateReport'
  },
  {
    type: 'model',
    summary: '汇总分析结果并输出最终报告',
    content: '季度销售分析报告已生成。主要结论：总销售额同比增长 15%，华东区域贡献最大，建议关注西南区域的下滑趋势并调整策略。报告已保存。'
  }
]

export const sampleSession = {
  id: 'session-demo-001',
  title: '季度销售数据分析会话',
  steps: sampleSteps
}
