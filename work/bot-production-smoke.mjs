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
const result = { botId:null, groupId:null, sessions:[], checks:[] }
const pass = text => { result.checks.push(text); console.log('PASS '+text) }
try {
  await send('Runtime.enable')
  if (process.env.BOT_SMOKE_RESUME) {
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent==='继续')?.click()`)
    await until(`!!document.querySelector('[data-testid="roster-row-yanshou-linshi-bot-0913"]')`)
    await click('roster-row-yanshou-linshi-bot-0913')
    await until(`document.querySelector('.rosterRow[data-active="true"]')?.dataset.testid==='roster-row-yanshou-linshi-bot-0913' && !!document.querySelector('[data-testid="composer-input"]') && !!document.querySelector('[data-testid="session-select"]').dataset.sessionId`)
  }
  if (!process.env.BOT_SMOKE_RESUME) {
  await until(`!!document.querySelector('[data-testid="bot-form-name"]')`)
  await fill('[data-testid="bot-form-name"]','验收临时 Bot 0913')
  await fill('[data-testid="bot-form-persona"]','你是界面验收助手。用户发消息时只回复 pong，不调用工具。')
  await click('bot-form-submit')
  await until(`!!document.querySelector('[data-testid="composer-input"]')`)
  result.botId=await ev(`document.querySelector('.rosterRow[data-active="true"]').dataset.testid.replace('roster-row-','')`)
  assert.notEqual(result.botId,'dsh-bot')
  assert.equal(await ev(`document.querySelectorAll('iframe[src*="dsh-bot/ui"]').length`),0)

  pass('native main panel + non-default persona + no Bot iframe')
  await fill('[data-testid="composer-input"]','【界面验收】请只回复 pong')
  await click('composer-send')
  await until(`document.querySelector('[data-testid="composer-send"]').textContent==='停止'`)
  await until(`document.querySelector('[data-testid="transcript"]')?.textContent.includes('pong') && document.querySelector('[data-testid="composer-send"]').textContent==='发送'`,55000)
  pass('real model roundtrip completed in central Bot content')
  }
  result.botId=await ev(`document.querySelector('.rosterRow[data-active="true"]').dataset.testid.replace('roster-row-','')`)
  const sessionId=await ev(`document.querySelector('[data-testid="session-select"]').dataset.sessionId`)
  result.sessions.push(sessionId)
  for (const id of ['memory','routines','peers']) {
    await click(id+'-open')
    assert.equal(await ev(`document.querySelectorAll('.memoryPanel').length`),1)
  }
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
  await until(`document.querySelectorAll('.memoryPanel').length===0`)
  pass('exclusive panels and Escape')
  await fill('[data-testid="composer-input"]','草稿 A')
  await click('session-new')
  await until(`document.querySelector('[data-testid="session-select"]').dataset.sessionId!==${JSON.stringify(sessionId)}`)
  const newId=await ev(`document.querySelector('[data-testid="session-select"]').dataset.sessionId`);result.sessions.push(newId)
  assert.equal(await ev(`document.querySelector('[data-testid="composer-input"]').value`),'')
  await fill('[data-testid="composer-input"]','草稿 B')
  await click('roster-session-'+sessionId)
  assert.equal(await ev(`document.querySelector('[data-testid="composer-input"]').value`),'草稿 A')
  await click('roster-session-'+newId)
  assert.equal(await ev(`document.querySelector('[data-testid="composer-input"]').value`),'草稿 B')
  await click('session-current-menu');await click('session-current-jump')
  await fill('[aria-label="对话或房间名称"]','界面验收 · 草稿隔离')
  await click('session-rename-save')
  await until(`document.querySelector('.sessionSwitch').textContent.includes('界面验收 · 草稿隔离')`)
  const listed=await rpc('listBotSessions',{botId:result.botId})
  assert.equal(listed.value.sessions.find(s=>s.sessionId===newId).title,'界面验收 · 草稿隔离')
  pass('per-thread draft restore + persisted rename')
  if (await ev(`!!document.querySelector('[data-testid="roster-row-jiemian-yanshou-linshi-xiaozu"]')`)) {
    await click('roster-row-jiemian-yanshou-linshi-xiaozu')
  } else {
  await click('roster-new-group')
  await fill('[data-testid="group-form-name"]','界面验收临时小组')
  await ev(`document.querySelector('[data-testid="group-form-member-${result.botId}"]').click();document.querySelector('[data-testid="group-form-member-dsh-bot"]').click()`)
  await click('group-form-submit')
  await until(`!!document.querySelector('[data-kind="group"][data-testid="conversation-pane"]')`)
  }
  result.groupId=await ev(`document.querySelector('.rosterRow[data-active="true"]').dataset.testid.replace('roster-row-','')`)
  await until(`!!document.querySelector('[data-testid="composer-input"]')`)
  assert.equal(await ev(`document.querySelector('[data-testid="session-new"]').textContent.trim()`),'新开房间')
  const roomId=await ev(`document.querySelector('[data-testid="session-select"]').dataset.sessionId`)
  await fill('[data-testid="composer-input"]','房间草稿 A');await click('session-new')
  await until(`document.querySelector('[data-testid="session-select"]').dataset.sessionId!==${JSON.stringify(roomId)}`)
  assert.equal(await ev(`document.querySelector('[data-testid="composer-input"]').value`),'')
  await click('roster-session-'+roomId)
  await until(`document.querySelector('[data-testid="session-select"]').dataset.sessionId===${JSON.stringify(roomId)}`)
  assert.equal(await ev(`document.querySelector('[data-testid="composer-input"]').value`),'房间草稿 A')
  await click('session-current-menu');await click('session-current-jump');await fill('[aria-label="对话或房间名称"]','界面验收 · 房间名称');await click('session-rename-save')
  await until(`document.querySelector('.sessionSwitch').textContent.includes('界面验收 · 房间名称')`)
  assert.equal((await rpc('listGroupSessions',{groupId:result.groupId})).value.rooms.find(r=>r.roomId===roomId).title,'界面验收 · 房间名称')
  await click('roster-menu-'+result.groupId);await click('roster-pin-'+result.groupId)
  await until(`!!document.querySelector('[data-testid="roster-section-pinned"] [data-testid="roster-row-${result.groupId}"]')`)
  await click('roster-menu-'+result.groupId);await click('roster-move-'+result.groupId);await click('roster-move-'+result.groupId+'-life')
  await until(`!!document.querySelector('[data-testid="roster-section-life"] [data-testid="roster-row-${result.groupId}"]')`)
  pass('group rooms in main panel + draft isolation + persisted naming/pin/category')
  await fill('[data-testid="composer-input"]','@all 【界面验收】请每位成员只回复 pong，不使用工具。')
  await click('composer-send')
  await until(`document.querySelector('[data-testid="composer-send"]').textContent==='停止'`)
  await until(`document.querySelector('[data-testid="composer-send"]').textContent==='发送' && document.querySelector('[data-testid="transcript"]')?.textContent.includes('pong')`,55000)
  const groupHistory=await rpc('history',{sessionId:roomId})
  assert(groupHistory.value.items.filter(item=>item.role==='assistant'&&item.author).length>=2)
  pass('real group roundtrip with attributed member replies')
  await ev(`document.querySelector('[aria-label="会话"]').click()`)
  await until(`!document.querySelector('[data-testid="dsh-bot-main-panel"]')`)
  await ev(`document.querySelector('[aria-label="Bot"]').click()`)
  await until(`!!document.querySelector('[data-testid="composer-input"]')`)
  pass('switching to Harness and back restores Bot')
  const heights=await ev(`[...document.querySelectorAll('.rosterRow')].map(e=>e.getBoundingClientRect().height)`)
  assert(heights.every(h=>h<=48))
  for(const scheme of ['light','dark']) {
    await ev(`document.body.style.colorScheme='${scheme}'`)
    const resolved=await ev(`getComputedStyle(document.querySelector('.dsh-bot-main-panel')).colorScheme`)
    assert.equal(resolved,scheme)
  }
  await ev(`document.body.style.removeProperty('color-scheme')`)
  pass('48px roster rows + inherited host theme')
  assert.equal(errors.length,0,errors.join('\n'))
  pass('zero runtime exceptions during verification')
} finally { await writeFile('work/bot-production-smoke-result.json',JSON.stringify({...result,errors},null,2));ws.close() }
