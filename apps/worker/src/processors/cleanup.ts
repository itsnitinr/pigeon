import { sql } from 'drizzle-orm'
import type { Job } from 'bullmq'

import { db } from '../lib/db'
import { env } from '../lib/env'
import type { CleanupNotificationsJobData } from '../lib/jobs'

const CLEANUP_BATCH_SIZE = 1000

function getRowCount(result: unknown): number {
  if (!result || typeof result !== 'object') {
    return 0
  }

  const typed = result as { rows?: unknown[]; rowCount?: number }

  if (typeof typed.rowCount === 'number') {
    return typed.rowCount
  }

  if (Array.isArray(typed.rows)) {
    return typed.rows.length
  }

  return 0
}

export async function processCleanupNotificationsJob(
  job: Job<CleanupNotificationsJobData>
): Promise<{ deletedCount: number }> {
  const ttlDays = job.data.ttlDays ?? env.NOTIFICATION_TTL_DAYS

  if (ttlDays < 0) {
    throw new Error('ttlDays must be greater than or equal to 0')
  }

  const cutoffDate = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000)

  let deletedCount = 0

  while (true) {
    const deleteResult = await db.execute(sql`
      DELETE FROM notifications
      WHERE id IN (
        SELECT id
        FROM notifications
        WHERE created_at < ${cutoffDate}
        ORDER BY created_at ASC
        LIMIT ${CLEANUP_BATCH_SIZE}
      )
      RETURNING id
    `)

    const currentBatchCount = getRowCount(deleteResult)
    deletedCount += currentBatchCount

    if (currentBatchCount < CLEANUP_BATCH_SIZE) {
      break
    }
  }

  return { deletedCount }
}
