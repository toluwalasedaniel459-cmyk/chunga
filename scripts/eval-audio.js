// Voice-note eval: transcribes every clip in data/audio/clips.json with QVAC
// Whisper, runs the transcript through rules + AI, and prints transcription
// time, word error rate (WER) and verdict accuracy.
//   CHUNGA_AUDIO=on npm run eval -- --audio            rules + AI
//   CHUNGA_AUDIO=on npm run eval -- --audio --rules    rules only (faster)
// Results are saved to data/eval_audio_results.json.
import { readFile, writeFile } from 'node:fs/promises'
import { analyse } from '../src/detect/analyse.js'
import { initLlm, closeLlm } from '../src/qvac/llm.js'
import { initWhisper, closeWhisper, transcribeFile, WHISPER_MODEL_NAME } from '../src/qvac/transcribe.js'

if (process.env.CHUNGA_AUDIO !== 'on') {
  console.log('Voice notes are off. QVAC\'s speech engine needs a CPU with AVX/AVX2.')
  console.log('On a laptop that has it, run:  $env:CHUNGA_AUDIO="on"; npm run eval -- --audio')
  process.exit(1)
}

const useLlm = !process.argv.includes('--rules')
const audioDir = new URL('../data/audio/', import.meta.url)
const { clips } = JSON.parse(await readFile(new URL('clips.json', audioDir), 'utf8'))

// Word error rate: how many words differ between what was said and what Whisper heard.
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
function wer (reference, hypothesis) {
  const r = words(reference)
  const h = words(hypothesis)
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) {
    const cur = [i]
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return r.length ? prev[h.length] / r.length : 0
}

// Load Whisper first, then the LLM, once each.
let t0 = performance.now()
await initWhisper()
const whisperLoadMs = performance.now() - t0
let llmLoadMs = 0
if (useLlm) {
  t0 = performance.now()
  await initLlm()
  llmLoadMs = performance.now() - t0
}

const rows = []
for (const clip of clips) {
  const path = decodeURIComponent(new URL(clip.file, audioDir).pathname).replace(/^\/([A-Za-z]:)/, '$1')
  const { text, ms: transcribeMs } = await transcribeFile(path)
  const { result, timing } = await analyse(text, { useLlm })
  const row = {
    id: clip.id,
    label: clip.label,
    verdict: result.verdict,
    transcribeMs,
    analysisMs: timing.totalMs,
    totalMs: transcribeMs + timing.totalMs,
    wer: Number(wer(clip.script, text).toFixed(3)),
    transcript: text
  }
  rows.push(row)
  console.log(`${row.verdict === row.label ? '✔' : '✖'} ${clip.id.padEnd(20)} expected ${clip.label.padEnd(4)} got ${result.verdict.padEnd(10)} transcribe ${(transcribeMs / 1000).toFixed(1)}s  analyse ${(timing.totalMs / 1000).toFixed(1)}s  WER ${(row.wer * 100).toFixed(0)}%`)
  console.log(`    heard: "${text}"`)
}
await closeWhisper()
if (useLlm) await closeLlm()

const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length
const summary = {
  mode: useLlm ? 'voice → rules + local AI' : 'voice → rules only',
  whisperModel: WHISPER_MODEL_NAME,
  date: new Date().toISOString(),
  clips: rows.length,
  verdictAccuracy: `${((100 * rows.filter((r) => r.verdict === r.label).length) / rows.length).toFixed(1)}%`,
  scamsMarkedSafe: rows.filter((r) => r.label === 'SCAM' && r.verdict === 'SAFE').length,
  safeWronglyFlagged: rows.filter((r) => r.label === 'SAFE' && r.verdict !== 'SAFE').length,
  avgWer: `${(avg('wer') * 100).toFixed(1)}%`,
  avgTranscribeMs: Math.round(avg('transcribeMs')),
  avgAnalysisMs: Math.round(avg('analysisMs')),
  avgTotalMs: Math.round(avg('totalMs')),
  whisperLoadMs: Math.round(whisperLoadMs),
  llmLoadMs: Math.round(llmLoadMs)
}

console.log(`\n── Voice-note results (${summary.mode}, ${WHISPER_MODEL_NAME}) ──`)
console.log(`Verdict accuracy:      ${summary.verdictAccuracy}  (${rows.length} clips)`)
console.log(`Scams marked SAFE:     ${summary.scamsMarkedSafe}`)
console.log(`Safe wrongly flagged:  ${summary.safeWronglyFlagged}`)
console.log(`Avg word error rate:   ${summary.avgWer}`)
console.log(`Avg transcription:     ${(summary.avgTranscribeMs / 1000).toFixed(1)}s`)
console.log(`Avg analysis:          ${(summary.avgAnalysisMs / 1000).toFixed(1)}s`)
console.log(`Avg total per clip:    ${(summary.avgTotalMs / 1000).toFixed(1)}s`)
console.log(`Model load (once):     Whisper ${(whisperLoadMs / 1000).toFixed(1)}s${useLlm ? `, LLM ${(llmLoadMs / 1000).toFixed(1)}s` : ''}`)

await writeFile(new URL('../data/eval_audio_results.json', import.meta.url), JSON.stringify({ summary, rows }, null, 2))
console.log('Saved data/eval_audio_results.json')
