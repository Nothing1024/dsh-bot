import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const pages = await (await fetch('http://127.0.0.1:9230/json/list')).json()
const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => { ws.onopen = resolve })
let serial = 0
const pending = new Map(), errors = []
ws.onmessage = event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  if (message.id) { const call = pending.get(message.id); pending.delete(message.id); message.error ? call.reject(message.error) : call.resolve(message.result) }
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text); return r.result.value }
const click = async id => { await ev(`document.querySelector('[data-testid="${id}"]').click()`); await wait(150) }
const until = async (expression, timeout=10000) => { const start=Date.now(); while(Date.now()-start<timeout){ if(await ev(expression)) return; await wait(250) } throw Error('Timed out: '+expression) }
const fill = async (selector,value) => { await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(80) }
const rpc = (method,args={}) => ev(`fetch('/dsh-bot/${method}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({args:${JSON.stringify(args)}})}).then(r=>r.json())`)
const result = { botId:null, sessionId:null, checks:[] }
const pass = text => { result.checks.push(text); console.log('PASS '+text) }
try {
  await send('Runtime.enable')
  await click('roster-new')
  await until(`!!document.querySelector('[data-testid="bot-form-name"]')`)
  await fill('[data-testid="bot-form-name"]','Visibility Check 0913')
  await fill('[data-testid="bot-form-persona"]','你是界面验收助手。根据用户请求运行无副作用的终端命令，然后只回复结果，不解释过程。')
  await click('bot-form-submit')
  await until(`!!document.querySelector('[data-testid="composer-input"]') && document.querySelector('.rosterRow[data-active="true"]')?.textContent.includes('Visibility Check')`)
  result.botId=await ev(`document.querySelector('.rosterRow[data-active="true"]').dataset.testid.replace('roster-row-','')`)
  await fill('[data-testid="composer-input"]','请调用终端工具执行 printf bot-visibility-pong，只回复执行结果。')
  await click('composer-send')
  await until(`!!document.querySelector('[data-testid="session-select"]').dataset.sessionId`)
  result.sessionId=await ev(`document.querySelector('[data-testid="session-select"]').dataset.sessionId`)
  const checkHidden=async()=>{
    const archived=await ev(`botCheckArchive()`)
    assert(archived.includes(result.sessionId))
    const r=await rpc('listBotSessions',{botId:result.botId})
    assert(r.value.sessions.some(s=>s.sessionId===result.sessionId && s.tags.includes('kind:hidden') && !s.hidden))
  }
  await checkHidden();pass('new chat hidden in Harness and listed in Bot')
  const start=Date.now()
  while(Date.now()-start<150000){
    assert.equal(await ev(`document.querySelectorAll('.transcript .foldCard,.transcript [data-kind="thinking"],.transcript [data-kind="tool"]').length`),0)
    if(await ev(`!!document.querySelector('.transcript [data-role="assistant"] .bubble') && document.querySelector('[data-testid="composer-send"]').textContent==='发送'`)) break
    await wait(500)
  }
  const history=await rpc('history',{sessionId:result.sessionId})
  assert.equal(history.value.working,false)
  assert(history.value.items.some(i=>i.kind==='tool'),'real tool call must be exercised')
  assert(await ev(`document.querySelector('.transcript').textContent.includes('bot-visibility-pong')`))
  assert.equal(await ev(`document.querySelectorAll('.transcript .foldCard').length`),0)
  await checkHidden();pass('real tool executed; streamed chat shows text only and stays archived')
  await click('roster-row-dsh-bot');await click('roster-row-'+result.botId)
  await until(`!!document.querySelector('.transcript [data-role="assistant"] .bubble')`)
  assert.equal(await ev(`document.querySelectorAll('.transcript .foldCard').length`),0)
  pass('history reload keeps text replies without process cards')
  await ev(`document.querySelector('[aria-label="会话"]').click()`)
  await until(`!document.querySelector('[data-testid="dsh-bot-main-panel"]')`)
  assert.equal(await ev(`document.body.innerText.includes('Visibility Check 0913')`),false)
  pass('official default session tree omits Bot chat')
  assert.equal(errors.length,0)
} finally {
  await writeFile('work/bot-visibility-smoke-result.json',JSON.stringify({...result,errors},null,2))
  ws.close()
}
