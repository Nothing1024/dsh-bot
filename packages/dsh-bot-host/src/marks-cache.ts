/**
 * Process-memory snapshot of `$DSH_HOME/session-tool/marks.jsonl`. Each read
 * revalidates with one `fs.stat` (mtime + size + inode; writes are
 * tmp+rename) and reparses through session-marks `listAll` only on change.
 * @module dsh-bot-host/marks-cache
 */

import { stat } from 'node:fs/promises'
import { listAll, marksPath } from 'session-marks'
import type { SessionMarksRow } from 'session-marks'

type MarksTable = ReadonlyMap<string, readonly string[]>

interface Snapshot {
  readonly path: string
  readonly key: string
  readonly table: MarksTable
}

let snapshot: Snapshot | undefined
let inflight: { readonly path: string; readonly promise: Promise<MarksTable> } | undefined
let generation = 0

async function statKey(path: string): Promise<string> {
  try {
    const info = await stat(path)
    return `${info.mtimeMs}:${info.size}:${info.ino}`
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return 'missing'
    throw error
  }
}

async function load(path: string, started: number): Promise<MarksTable> {
  const key = await statKey(path)
  if (snapshot !== undefined && snapshot.path === path && snapshot.key === key) return snapshot.table
  const table = new Map<string, readonly string[]>()
  if (key !== 'missing') {
    for (const row of await listAll()) table.set(row.id, row.tags)
  }
  if (generation === started) snapshot = { path, key, table }
  return table
}

/** Current mark table; concurrent callers share one revalidation. */
export function marksTable(): Promise<MarksTable> {
  const path = marksPath()
  if (inflight !== undefined && inflight.path === path) return inflight.promise
  const promise = load(path, generation).finally(() => {
    if (inflight?.promise === promise) inflight = undefined
  })
  inflight = { path, promise }
  return promise
}

/** One session's marks, or `undefined` when it has no row. */
export async function marksOf(sessionId: string): Promise<readonly string[] | undefined> {
  return (await marksTable()).get(sessionId.trim())
}

/** Rows whose set contains an exact token, in table order. */
export async function rowsWithMark(mark: string): Promise<SessionMarksRow[]> {
  const rows: SessionMarksRow[] = []
  for (const [id, tags] of await marksTable()) {
    if (tags.includes(mark)) rows.push({ id, tags })
  }
  return rows
}

/** Drop the snapshot after an in-process marks write so it is never missed. */
export function invalidateMarks(): void {
  generation += 1
  snapshot = undefined
  inflight = undefined
}
