import { createContext, useContext, type ReactNode } from 'react'

// 默认客户端 locale Provider：提供简体中文文案与 t() 查询。
// 仅作平台默认 locale 占位；正式 i18n 模块安装后替换。

const messages = {
  'app.title': 'JLG 设备管理平台',
  'app.subtitle': '设备状态 · 故障诊断 · 远程升级 · 维修工单 · 设备履历',

  'nav.equipment-status': '设备状态',
  'nav.equipment-status.desc': '查看设备当前与历史状态记录',
  'nav.fault-diagnosis': '故障诊断',
  'nav.fault-diagnosis.desc': '记录故障并推进诊断状态流转',
  'nav.upgrade': '远程升级',
  'nav.upgrade.desc': '发起升级任务并跟踪状态结果',
  'nav.work-order': '维修工单',
  'nav.work-order.desc': '创建工单、记录处理并推进状态',
  'nav.equipment-history': '设备履历',
  'nav.equipment-history.desc': '按时间倒序查看设备全量历史',

  'action.search': '搜索',
  'action.create': '新建',
  'action.submit': '提交',
  'action.cancel': '取消',
  'action.reload': '刷新',
  'action.advance': '推进状态',
  'action.save': '保存',
  'action.add': '添加',

  'state.loading': '加载中…',
  'state.empty': '暂无数据',
  'state.empty.equipment': '暂无设备，请先在后端创建设备',
  'state.empty.list': '列表为空',
  'state.error': '加载失败',
  'state.select-hint': '请在左侧选择一条记录查看详情',
  'state.demo': '演示数据（后端未连接）',

  'common.equipment': '设备',
  'common.status': '状态',
  'common.description': '描述',
  'common.created-at': '创建时间',
  'common.updated-at': '更新时间',
  'common.closed-at': '关闭时间',
  'common.identifier': '标识',
  'common.name': '名称',
  'common.type': '类型',
  'common.params': '运行参数',
  'common.recorded-at': '记录时间',
  'common.diagnosis': '诊断结论',
  'common.suggestion': '处理建议',
  'common.package-id': '升级包标识',
  'common.result': '结果',
  'common.failure-reason': '失败原因',
  'common.records': '处理记录',
  'common.status-logs': '状态流转',
  'common.content': '内容',
  'common.fault-id': '关联故障',
  'common.filter': '筛选',
  'common.all': '全部',
}

export type MessageKey = keyof typeof messages

interface I18nContextValue {
  t: (key: MessageKey) => string
}

const I18nContext = createContext<I18nContextValue>({ t: (k) => messages[k] })

export function AppProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={{ t: (key) => messages[key] }}>{children}</I18nContext.Provider>
}

export function useT() {
  return useContext(I18nContext).t
}
