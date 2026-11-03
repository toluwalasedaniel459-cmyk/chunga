// Smoke test for the Executa plugin: starts plugin.js exactly like the Anna
// Agent does (a long-running process speaking JSON-RPC lines over stdio),
// sends requests, and checks every reply.
//   npm test                       rules only (fast)
//   npm test -- --ai               also wait for the local AI and check with it
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const withAi = process.argv.includes('--ai')
const plugin = spawn(process.execPath, [fileURLToPath(new URL('./plugin.js', import.meta.url))], {
  env: { ...process.env, CHUNGA_AI: withAi ? 'on' : 'off' },
  stdio: ['pipe', 'pipe', 'pipe']
})
const stderrLines = []
readline.createInterface({ input: plugin.stderr }).on('line', (l) => { stderrLines.push(l); if (withAi) console.log(`   (stderr) ${l}`) })

// Every stdout line must be one JSON-RPC object.
const replies = new Map()
const badLines = []
readline.createInterface({ input: plugin.stdout }).on('line', (line) => {
  try {
    const msg = JSON.parse(line)
    if (msg.jsonrpc !== '2.0') badLines.push(line)
    replies.set(msg.id, msg)
  } catch { badLines.push(line) }
})

let id = 0
async function call (method, params, timeoutMs = 10000) {
  const myId = ++id
  const t0 = performance.now()
  plugin.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, id: myId, ...(params ? { params } : {}) }) + '\n')
  for (const end = Date.now() + timeoutMs; Date.now() < end; await new Promise((r) => setTimeout(r, 20))) {
    if (replies.has(myId)) return { ...replies.get(myId), ms: Math.round(performance.now() - t0) }
  }
  throw new Error(`${method} timed out after ${timeoutMs} ms`)
}

let failures = 0
function check (name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures++
}
const invoke = (args, timeoutMs) => call('invoke', { tool: 'check_message', arguments: args }, timeoutMs)
const SCAM = 'Hello, I have sent you 3,500 by mistake. Please send it back to 07XX XXX 214. God bless you.'
const SAFE = 'TJA7K2LM4Q Confirmed. You have received Ksh 1,200.00 from GRACE WANJIRU on 14/10/26 at 9:12 AM. New M-PESA balance is Ksh 4,830.50.'

const d = await call('describe', null, 5000)
check('describe answers within 5 s', d.result?.name === 'chunga' && d.ms < 5000, `${d.ms} ms`)
check('describe: version 1.0.0, one tool check_message', d.result?.version === '1.0.0' && d.result?.tools?.length === 1 && d.result.tools[0].name === 'check_message')

const h = await call('health')
check('health is ready', h.result?.status === 'ready', `ai=${h.result?.details?.ai}`)

for (const lang of ['en', 'sw', 'pcm']) {
  const r = await invoke({ message: SCAM, language: lang })
  const data = r.result?.data
  check(`SCAM message (${lang}) → SCAM`, r.result?.success === true && data?.verdict === 'SCAM', `${data?.confidence}% · ${r.ms} ms · "${data?.explanation?.slice(0, 70)}…"`)
}
const safe = await invoke({ message: SAFE })
check('real M-PESA receipt → SAFE', safe.result?.data?.verdict === 'SAFE', `${safe.result?.data?.confidence}% · ${safe.ms} ms`)
const noLang = await invoke({ message: SCAM })
check('language is optional (defaults to en)', noLang.result?.data?.language === 'en')

const empty = await invoke({ message: '   ' })
check('empty message → success:false with error', empty.result?.success === false && typeof empty.result?.error === 'string', empty.result?.error)
const badLang = await invoke({ message: SCAM, language: 'fr' })
check('unsupported language → success:false with error', badLang.result?.success === false, badLang.result?.error)
const unknownTool = await call('invoke', { tool: 'nope', arguments: {} })
check('unknown tool → JSON-RPC -32601', unknownTool.error?.code === -32601)
const unknownMethod = await call('frobnicate')
check('unknown method → JSON-RPC -32601', unknownMethod.error?.code === -32601)
plugin.stdin.write('this is not json\n')
await new Promise((r) => setTimeout(r, 300))
check('bad JSON line → -32700 parse error', replies.get(null)?.error?.code === -32700)
replies.delete(null)

if (withAi) {
  console.log('… waiting for the local AI to load (can take minutes on a slow PC)')
  let state = ''
  for (const end = Date.now() + 10 * 60000; Date.now() < end && !['ready', 'error'].includes(state); await new Promise((r) => setTimeout(r, 3000))) {
    state = (await call('health')).result?.details?.ai
  }
  check('local AI loaded', state === 'ready', `ai=${state}`)
  if (state === 'ready') {
    const r = await invoke({ message: SCAM }, Number(process.env.CHUNGA_AI_BUDGET_MS || 150000) + 30000)
    const data = r.result?.data
    check('SCAM message with AI → SCAM, AI used', data?.verdict === 'SCAM' && data?.ai_used === true, `${data?.decided_by} · ${Math.round(r.ms / 1000)} s`)
  }
}

check('every stdout line was a JSON-RPC frame', badLines.length === 0, badLines.length ? JSON.stringify(badLines.slice(0, 2)) : '')

// stdin EOF = Agent shutdown → the plugin must exit cleanly by itself.
const t0 = performance.now()
plugin.stdin.end()
const code = await new Promise((resolve) => plugin.on('exit', resolve))
check('exits with code 0 on stdin EOF', code === 0, `${Math.round(performance.now() - t0)} ms`)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
