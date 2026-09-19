/**
 * Per-session persona snapshot. Create-time voice is frozen so later
 * registry edits only affect new sessions (UF-204).
 * @module dsh-bot-host/session-voice-store
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface SessionVoiceStore {
  snapshot(sessionId: string, persona: string): Promise<void>
  read(sessionId: string): Promise<string | undefined>
}

export function createSessionVoiceStore(home: () => string): SessionVoiceStore {
  const fileOf = (sessionId: string): string => join(home(), 'dsh-bot', 'session-voice', `${sessionId}.txt`)
  return {
    async snapshot(sessionId, persona) {
      const id = sessionId.trim()
      const text = persona.trim()
      if (id === '' || text === '') return
      const file = fileOf(id)
      try {
        await access(file)
        return
      } catch {
        // first write wins (UF-204)
      }
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, `${text}\n`, 'utf8')
    },
    async read(sessionId) {
      const id = sessionId.trim()
      if (id === '') return undefined
      try {
        const raw = await readFile(fileOf(id), 'utf8')
        const text = raw.replace(/\n+$/u, '')
        return text === '' ? undefined : text
      } catch {
        return undefined
      }
    },
  }
}
