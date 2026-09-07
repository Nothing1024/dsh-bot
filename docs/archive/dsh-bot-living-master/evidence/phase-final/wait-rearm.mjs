import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const evR = join(here, '../../dsh-bot-routines/evidence')
const ID = 'r-1788703764909-hba0u1c9'
const BASE = 'http://127.0.0.1:3084'

async function rpc(method, args = {}) {
  const res = await fetch(`${BASE}/dsh-bot/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return await res.json()
}

async function rowNow() {
  const listed = await rpc('routineList', {})
  return (listed.value ?? []).find(item => item.id === ID)
}

const started = Date.now()
const before = await rowNow()
const deadline = started + 130000
let last = before
while (Date.now() < deadline) {
  last = await rowNow()
  const n = last?.runs?.length ?? 0
  console.log(`rearm poll runs=${n} last=${last?.lastOutcome} elapsed=${Date.now() - started}`)
  if (n > (before?.runs?.length ?? 0) && last?.lastOutcome === 'spoke') break
  await new Promise(r => setTimeout(r, 8000))
}
const dest = join(evR, 'UF-904/rearm-after-wait.json')
mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, `${JSON.stringify({ before, after: last, elapsed: Date.now() - started }, null, 2)}\n`)
const grew = (last?.runs?.length ?? 0) > (before?.runs?.length ?? 0)
console.log(`wait-rearm done grew=${grew} ${before?.runs?.length ?? 0}→${last?.runs?.length ?? 0} last=${last?.lastOutcome}`)
