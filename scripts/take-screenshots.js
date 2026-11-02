// Takes phone-sized screenshots of the running app for the README / DoraHacks.
// Drives Microsoft Edge (or Chrome) in headless mode through the DevTools
// protocol, using Node's built-in WebSocket – nothing to install.
//
// 1. Start the app:   $env:CHUNGA_AI="off"; npm start     (rules only, instant)
// 2. In a 2nd window: npm run screenshots
// Output: docs/screenshots/*.png (390×844 CSS px at 2× = 780×1688)
// Set CHUNGA_BROWSER to the browser .exe if Edge isn't in the default place.
import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BROWSER = process.env.CHUNGA_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const APP = process.env.CHUNGA_URL || 'http://localhost:3000'
const OUT = new URL('../docs/screenshots/', import.meta.url)
const PORT = 9333
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Same synthetic messages as data/test_messages.json (scam-02 and safe-01).
const SCAM_SMS = 'Hello, I have sent you 3,500 by mistake, it was meant for my mother\'s hospital bill. Please send it back to 07XX XXX 214. God bless you.'
const SCAM_SENDER = '+2547XX XXX 214'
const SAFE_SMS = 'TJA7K2LM4Q Confirmed. You have received Ksh 1,200.00 from GRACE WANJIRU on 14/10/26 at 9:12 AM. New M-PESA balance is Ksh 4,830.50.'
const SAFE_SENDER = 'MPESA'

// ---- Start a headless browser with a throwaway profile ----------------------
const profile = join(tmpdir(), `chunga-shots-${Date.now()}`)
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })

let page
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500)
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch { /* not up yet */ }
}
if (!page) throw new Error('Browser did not start. Set CHUNGA_BROWSER to the path of msedge.exe or chrome.exe.')

// ---- Tiny DevTools-protocol client -----------------------------------------
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let nextId = 1
const pending = new Map()
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data)
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id)
    pending.delete(data.id)
    data.error ? reject(new Error(data.error.message)) : resolve(data.result)
  }
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
// Run code in the page and return its result.
const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
const waitFor = async (expression, timeoutMs = 20000) => {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(200)) if (await run(expression)) return
  throw new Error(`Timed out waiting for: ${expression}`)
}

async function shot (name) {
  await sleep(400) // let the layout settle
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(new URL(name, OUT), Buffer.from(data, 'base64'))
  console.log(`✔ docs/screenshots/${name}`)
}

// Type into a field the way a person would, so the page sees normal input.
const fill = (id, value) => run(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const click = (selector) => run(`(() => { document.querySelector(${JSON.stringify(selector)}).click(); return true })()`)
// Scroll so an element sits just below the top edge (16 px gap).
const scrollTo = (selector) => run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16); return true })()`)
const resultShown = "!document.getElementById('result').hidden && document.getElementById('progress').hidden"

try {
  await mkdir(OUT, { recursive: true })
  // A phone-sized screen in light mode.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await send('Page.enable')
  await send('Page.navigate', { url: APP })
  await waitFor("document.readyState === 'complete' && !!document.getElementById('check-text')")
  await run("(() => { try { localStorage.setItem('chunga-lang', 'en') } catch {} ; return true })()")
  await send('Page.reload')
  await waitFor("document.readyState === 'complete' && document.documentElement.lang === 'en'")

  // 1. Home screen with the fake reversal SMS pasted in
  await fill('message', SCAM_SMS)
  await fill('sender', SCAM_SENDER)
  await shot('1-home-pasted-sms.png')

  // 2. SCAM verdict with its red flags
  await click('#check-text')
  await waitFor(resultShown)
  await scrollTo('#check-text')
  await shot('2-scam-verdict.png')

  // 3. The same result in Swahili
  await click('.lang button[data-lang="sw"]')
  await waitFor("document.documentElement.lang === 'sw'")
  await scrollTo('#check-text')
  await shot('3-swahili-explanation.png')

  // 4. SAFE result on a normal M-PESA receipt (back in English)
  await click('.lang button[data-lang="en"]')
  await click('#again')
  await run('window.scrollTo(0, 0)')
  await fill('message', SAFE_SMS)
  await fill('sender', SAFE_SENDER)
  await click('#check-text')
  await waitFor(resultShown)
  await scrollTo('label[for="sender"]') // keep the MPESA sender in view
  await shot('4-safe-result.png')
} finally {
  ws.close()
  browser.kill()
  await sleep(800)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
