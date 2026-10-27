// Runs every message in data/test_messages.json through Chunga and prints
// accuracy and average response time.
// Run: npm run eval
import { readFile } from 'node:fs/promises'
import { analyse } from '../src/detect/analyse.js'

const { messages } = JSON.parse(await readFile(new URL('../data/test_messages.json', import.meta.url), 'utf8'))

let strictCorrect = 0 // verdict exactly right (SCAM→SCAM, SAFE→SAFE)
let caught = 0 // scams flagged as SCAM or SUSPICIOUS
let falseAlarms = 0 // safe messages flagged as SCAM or SUSPICIOUS
let totalMs = 0
const scams = messages.filter((m) => m.label === 'SCAM').length
const safes = messages.length - scams

for (const m of messages) {
  const start = performance.now()
  const result = await analyse(m.text, { sender: m.sender })
  const ms = performance.now() - start
  totalMs += ms

  const ok = result.verdict === m.label
  if (ok) strictCorrect++
  if (m.label === 'SCAM' && result.verdict !== 'SAFE') caught++
  if (m.label === 'SAFE' && result.verdict !== 'SAFE') falseAlarms++

  const mark = ok ? '✔' : (m.label === 'SCAM' && result.verdict === 'SUSPICIOUS' ? '~' : '✖')
  console.log(`${mark} ${m.id.padEnd(8)} expected ${m.label.padEnd(4)} got ${result.verdict.padEnd(10)} ${String(result.confidence).padStart(3)}%  ${result.reasonCodes.join(', ')}  (${ms.toFixed(0)} ms)`)
}

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`
console.log('\n── Results ─────────────────────────────')
console.log(`Messages:            ${messages.length} (${scams} scam, ${safes} safe)`)
console.log(`Exact accuracy:      ${pct(strictCorrect, messages.length)}  (SCAM must be SCAM, SAFE must be SAFE)`)
console.log(`Scams caught:        ${caught}/${scams} = ${pct(caught, scams)}  (flagged SCAM or SUSPICIOUS)`)
console.log(`False alarms:        ${falseAlarms}/${safes} = ${pct(falseAlarms, safes)}  (safe messages flagged)`)
console.log(`Avg response time:   ${(totalMs / messages.length).toFixed(1)} ms`)
