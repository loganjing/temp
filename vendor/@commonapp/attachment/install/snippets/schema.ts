// snippet: migration 设计资源，不在应用启动时执行
// 选择真实的 tableName/entityColumn 后，取出 SQL 并提交为宿主的版本化 .sql migration。
import { getAttachmentDdl } from '@commonapp/attachment'

const migrationSql = getAttachmentDdl({
  tableName: '{{tableName}}',
  entityColumn: '{{entityColumn}}',
})

// 把 migrationSql 的内容写入 src/server/migrations/sqlite/<next-version>_attachments.sql。
// 如果已有附件表，要先设计保留数据的迁移；不要重复建表或改写已执行的 migration。
