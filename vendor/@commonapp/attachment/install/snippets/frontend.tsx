// snippet: 前端组件替换
// 用通用组件替换内联附件 UI

import {
  AttachmentList,
  AttachmentUploader,
  createAttachmentApiClient,
} from '@commonapp/attachment/client'

// 1. 创建 API 客户端（在模块级或组件级）
const attachmentApi = createAttachmentApiClient({
  basePath: '/api/tickets',  // ← AI: 宿主的 API 前缀
  // Cookie 会话使用默认 credentials: 'include'；Bearer 认证才提供 authProvider。
})

// 2. 工单详情组件中替换内联附件列表
//    原有的内联附件列表 UI + handleDownload/handleShareLink/handleDeleteAttachment 删除
//    替换为：
<AttachmentList
  attachments={detail.attachments}
  canEdit={canEdit}
  formatSize={formatSize}  // ← AI: 宿主的文件大小格式化函数
  icons={{ download: Download, share: Share2, delete: Trash2 }}  // ← AI: 宿主的图标（lucide-react）
  labels={{  // ← AI: 宿主的 i18n 文案
    attachments: (n) => t('ticket.attachments', { n }),
    download: t('ticketForm.downloadAttachment'),
    share: t('ticketForm.shareAttachment'),
    delete: t('ticketForm.deleteAttachment'),
  }}
  onDownload={async (att) => {
    const blob = await attachmentApi.download(detail.id, att.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = att.name; a.click()
    URL.revokeObjectURL(url)
  }}
  onShare={async (att) => {
    const url = await attachmentApi.shareLink(detail.id, att.id)
    await navigator.clipboard.writeText(url)
  }}
  onDelete={async (att) => {
    await attachmentApi.delete(detail.id, att.id)
    onReload()
  }}
/>

// 3. 工单表单组件中替换内联上传逻辑
//    原有的 pendingFiles/handleFileSelect/uploadPendingFiles 删除
//    替换为：
<AttachmentUploader
  entityId={ticketId}
  maxFileSize={{{maxFileSize}}}
  existingAttachments={attachments}
  canEdit={true}
  labels={{  // ← AI: 宿主的 i18n 文案
    dropHint: t('ticketForm.attachHint'),
    fileTooLarge: (name, mb) => t('ticketForm.fileTooLarge'),
  }}
  onUpload={async (file) => {
    const att = await attachmentApi.upload(ticketId, file)
    setAttachments(prev => [...prev, att])
  }}
  onRemove={async (att) => {
    await attachmentApi.delete(ticketId, att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }}
/>

// 4. 嵌入式面板中替换只读附件列表
<AttachmentList
  attachments={detail.attachments}
  readOnly
/>
