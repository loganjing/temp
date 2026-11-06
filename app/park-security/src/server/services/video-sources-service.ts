import type { DbClient } from '@commonapp/dbkit'
import type { VideoSource } from '../../shared/types'

export async function listVideoSources(db: DbClient): Promise<VideoSource[]> {
  return db.queryAll<VideoSource>({
    text: 'SELECT id, name, source_url, created_at FROM video_sources ORDER BY created_at, id',
  })
}
