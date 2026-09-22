import { readFile, writeFile } from 'node:fs/promises'
const pages = await (await fetch('http://127.0.0.1:9230/json/list')).json()
const ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => { ws.onopen = resolve })
let serial = 0
const pending = new Map()
ws.onmessage = event => { const result = JSON.parse(event.data); if (result.id) { const call = pending.get(result.id); pending.delete(result.id); result.error ? call.reject(result.error) : call.resolve(result.result) } }
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
try {
  if (process.argv[2] === 'login') {
    const log = await readFile('/tmp/dsh-bot-implementation-gateway.log', 'utf8')
    const urls = log.match(/https?:\/\/[^\s\u001b]+/g) ?? []
    const url = urls.find(url => url.includes('3084') && /token|auth/.test(url))
    if (!url) throw Error('Authenticated startup URL not yet available')
    const target = new URL(url); target.hostname = '192.168.6.211'
    await send('Page.navigate', { url: target.href })
    console.log('Navigated to gateway using startup authentication URL (credential omitted)')
  } else if(process.argv[2] === 'shot') {
    await send('Emulation.setDeviceMetricsOverride', { width: 1450, height: 1000, deviceScaleFactor: 1, mobile: false })
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile('/tmp/dsh-bot-production.png', Buffer.from(shot.data, 'base64'))
  } else {
    const r = await send('Runtime.evaluate', { expression: process.argv[2] ?? 'document.body.innerText.slice(0,1800)', returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text)
    console.log(r.result.value)
  }
} finally { ws.close() }
