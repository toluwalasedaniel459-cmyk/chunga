// Screenshot eval: reads every image in data/images/images.json with QVAC OCR,
// runs the text through rules + AI, and prints OCR time, word error rate (WER)
// and verdict accuracy.
//   npm run eval -- --images            rules + AI
//   npm run eval -- --images --rules    rules only (faster)
//   npm run eval -- --images --only img-scam-reversal,img-safe-receipt
// Results are saved to data/eval_image_results.json (full runs only).
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { analyse } from '../src/detect/analyse.js'
import { initLlm, closeLlm } from '../src/qvac/llm.js'
import { initOcr, closeOcr, readImage } from '../src/qvac/ocr.js'

const useLlm = !process.argv.includes('--rules')
const imgDir = new URL('../data/images/', import.meta.url)
let { images } = JSON.parse(await readFile(new URL('images.json', imgDir), 'utf8'))
const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : ''
if (onlyArg) images = images.filter((img) => onlyArg.split(',').includes(img.id))

// Word error rate against the words actually in the picture (sender + bubbles).
// The status bar time and "Today" are left out, since they're on screen but not
// part of the message.
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
function wer (reference, hypothesis) {
  const r = words(reference)
  const h = words(hypothesis).filter((w) => !['10', '42', 'today'].includes(w))
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) {
    const cur = [i]
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1))
    prev = cur
  }
  return r.length ? prev[h.length] / r.length : 0
}

let t0 = performance.now()
await initOcr()
const ocrLoadMs = performance.now() - t0
let llmLoadMs = 0
if (useLlm) {
  t0 = performance.now()
  await initLlm()
  llmLoadMs = performance.now() - t0
}

const rows = []
for (const img of images) {
  const { text, ms: ocrMs } = await readImage(fileURLToPath(new URL(img.file, imgDir)))
  const { result, timing } = await analyse(text, { useLlm })
  const row = {
    id: img.id,
    label: img.label,
    verdict: result.verdict,
    ocrMs,
    analysisMs: timing.totalMs,
    totalMs: ocrMs + timing.totalMs,
    wer: Number(wer(`${img.sender} ${img.bubbles.join(' ')}`, text).toFixed(3)),
    text
  }
  rows.push(row)
  console.log(`${row.verdict === row.label ? '✔' : '✖'} ${img.id.padEnd(18)} expected ${img.label.padEnd(4)} got ${result.verdict.padEnd(10)} OCR ${(ocrMs / 1000).toFixed(1)}s  analyse ${(timing.totalMs / 1000).toFixed(1)}s  WER ${(row.wer * 100).toFixed(0)}%`)
  console.log(`    read: "${text}"`)
}
await closeOcr()
if (useLlm) await closeLlm()

const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length
const summary = {
  mode: useLlm ? 'screenshot → rules + local AI' : 'screenshot → rules only',
  date: new Date().toISOString(),
  images: rows.length,
  verdictAccuracy: `${((100 * rows.filter((r) => r.verdict === r.label).length) / rows.length).toFixed(1)}%`,
  scamsMarkedSafe: rows.filter((r) => r.label === 'SCAM' && r.verdict === 'SAFE').length,
  safeWronglyFlagged: rows.filter((r) => r.label === 'SAFE' && r.verdict !== 'SAFE').length,
  avgWer: `${(avg('wer') * 100).toFixed(1)}%`,
  avgOcrMs: Math.round(avg('ocrMs')),
  avgAnalysisMs: Math.round(avg('analysisMs')),
  avgTotalMs: Math.round(avg('totalMs')),
  ocrLoadMs: Math.round(ocrLoadMs),
  llmLoadMs: Math.round(llmLoadMs)
}

console.log(`\n── Screenshot results (${summary.mode}) ──`)
console.log(`Verdict accuracy:      ${summary.verdictAccuracy}  (${rows.length} images)`)
console.log(`Scams marked SAFE:     ${summary.scamsMarkedSafe}`)
console.log(`Safe wrongly flagged:  ${summary.safeWronglyFlagged}`)
console.log(`Avg word error rate:   ${summary.avgWer}`)
console.log(`Avg OCR time:          ${(summary.avgOcrMs / 1000).toFixed(1)}s`)
console.log(`Avg analysis:          ${(summary.avgAnalysisMs / 1000).toFixed(1)}s`)
console.log(`Avg total per image:   ${(summary.avgTotalMs / 1000).toFixed(1)}s`)
console.log(`Model load (once):     OCR ${(ocrLoadMs / 1000).toFixed(1)}s${useLlm ? `, LLM ${(llmLoadMs / 1000).toFixed(1)}s` : ''}`)

if (!onlyArg) {
  await writeFile(new URL('../data/eval_image_results.json', import.meta.url), JSON.stringify({ summary, rows }, null, 2))
  console.log('Saved data/eval_image_results.json')
}
