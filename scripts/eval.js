// Runs every message in data/test_messages.json through Chunga and prints
// accuracy and response times.
//   npm run eval            rules + local AI (full app)
//   npm run eval -- --rules rules only (instant, no model needed)
//   npm run eval -- --audio voice-note clips in data/audio (see eval-audio.js)
//   npm run eval -- --images screenshots in data/images (see eval-images.js)
// Results are also saved to data/eval_results.json for the README.
import { readFile, writeFile } from 'node:fs/promises'
import { analyse } from '../src/detect/analyse.js'
import { initLlm, closeLlm } from '../src/qvac/llm.js'

if (process.argv.includes('--audio')) {
  await import('./eval-audio.js')
  process.exit(0)
}
if (process.argv.includes('--images')) {
  await import('./eval-images.js')
  process.exit(0)
}

const useLlm = !process.argv.includes('--rules')
let { messages } = JSON.parse(await readFile(new URL('../data/test_messages.json', import.meta.url), 'utf8'))

// --only id1,id2 runs a subset (handy on slow laptops). Subset runs are not saved.
const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : ''
if (onlyArg) messages = messages.filter((m) => onlyArg.split(',').includes(m.id))

let loadMs = 0
if (useLlm) {
  const t0 = performance.now()
  await initLlm()
  loadMs = performance.now() - t0
}

const rows = []
for (const m of messages) {
  const { result, rulesResult, timing } = await analyse(m.text, { sender: m.sender, useLlm })
  rows.push({ id: m.id, label: m.label, verdict: result.verdict, rulesVerdict: rulesResult.verdict, confidence: result.confidence, decidedBy: result.decidedBy, timing })
  const ok = result.verdict === m.label
  const mark = ok ? '✔' : (m.label === 'SCAM' && result.verdict === 'SUSPICIOUS' ? '~' : '✖')
  console.log(`${mark} ${m.id.padEnd(8)} expected ${m.label.padEnd(4)} got ${result.verdict.padEnd(10)} ${String(result.confidence).padStart(3)}%  ${(timing.totalMs / 1000).toFixed(1)}s  ${result.decidedBy}`)
}
if (useLlm) await closeLlm()

// ---- Summary ----------------------------------------------------------------
const scams = rows.filter((r) => r.label === 'SCAM')
const safes = rows.filter((r) => r.label === 'SAFE')
const exact = rows.filter((r) => r.verdict === r.label).length
const scamsMissed = scams.filter((r) => r.verdict === 'SAFE')
const falseAlarms = safes.filter((r) => r.verdict !== 'SAFE')
const times = rows.map((r) => r.timing.totalMs)
const avg = times.reduce((a, b) => a + b, 0) / times.length
const firstTokens = rows.map((r) => r.timing.firstTokenMs).filter((x) => x != null)
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`

const summary = {
  mode: useLlm ? 'rules + local AI' : 'rules only',
  date: new Date().toISOString(),
  messages: rows.length,
  exactAccuracy: pct(exact, rows.length),
  scamsMarkedSafe: scamsMissed.length,
  safeWronglyFlagged: falseAlarms.length,
  avgResponseMs: Math.round(avg),
  maxResponseMs: Math.round(Math.max(...times)),
  avgFirstTokenMs: firstTokens.length ? Math.round(firstTokens.reduce((a, b) => a + b, 0) / firstTokens.length) : null,
  modelLoadMs: Math.round(loadMs)
}

console.log(`\n── Results (${summary.mode}) ─────────────────────`)
console.log(`Messages:               ${rows.length} (${scams.length} scam, ${safes.length} safe)`)
console.log(`Exact accuracy:         ${summary.exactAccuracy}  (SCAM→SCAM, SAFE→SAFE)`)
console.log(`Scams marked SAFE:      ${scamsMissed.length}/${scams.length}  ${scamsMissed.map((r) => r.id).join(' ')}`)
console.log(`Safe wrongly flagged:   ${falseAlarms.length}/${safes.length}  ${falseAlarms.map((r) => r.id).join(' ')}`)
console.log(`Avg / max response:     ${(avg / 1000).toFixed(2)}s / ${(summary.maxResponseMs / 1000).toFixed(2)}s`)
if (useLlm) {
  console.log(`Avg time to 1st token:  ${(summary.avgFirstTokenMs / 1000).toFixed(1)}s`)
  console.log(`Model load (once):      ${(loadMs / 1000).toFixed(1)}s`)
}

if (onlyArg) process.exit(0)
const out = new URL(`../data/eval_results${useLlm ? '' : '_rules'}.json`, import.meta.url)
await writeFile(out, JSON.stringify({ summary, rows }, null, 2))
console.log(`Saved ${out.pathname.split('/').slice(-2).join('/')}`)
