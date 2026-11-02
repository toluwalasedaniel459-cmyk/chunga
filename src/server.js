// Chunga local web server. Everything runs on this computer: no cloud, no internet
// needed once the models are downloaded (npm run setup-models).
//
//   npm start            → http://localhost:3000
//   CHUNGA_AUDIO=on      → also load Whisper for voice notes
//                          (off by default: QVAC's speech engine crashes on CPUs
//                          without AVX/AVX2, and the crash would stop the LLM too)
//
// API (each check streams back newline-delimited JSON, one event per line):
//   GET  /api/status                       → { llm, audio }
//   POST /api/check-text   {text, sender}  → rules → ai-progress… → final
//   POST /api/check-audio  (raw file body,
//        header X-Filename)                → transcript → rules → ai-progress… → final
import http from 'node:http'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { analyse } from './detect/analyse.js'
import { initLlm } from './qvac/llm.js'
import { initWhisper, transcribeFile, WHISPER_MODEL_NAME } from './qvac/transcribe.js'

const PORT = Number(process.env.PORT || 3000)
const ROOT = resolve(import.meta.dirname, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const UPLOAD_DIR = join(ROOT, 'uploads')
const AUDIO_ENABLED = process.env.CHUNGA_AUDIO === 'on'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB is plenty for a voice note
const MAX_TEXT_CHARS = 2000

// Audio types QVAC can decode itself (from its FORMATS_NEEDING_DECODE list).
// WhatsApp ".opus" voice notes are Ogg files, so we save them as ".ogg".
const AUDIO_EXT = { '.mp3': '.mp3', '.m4a': '.m4a', '.ogg': '.ogg', '.opus': '.ogg', '.oga': '.ogg', '.wav': '.wav', '.flac': '.flac', '.aac': '.aac' }

// ---- Model status, shown in the UI ("Loading AI…") -------------------------
const status = { llm: 'loading', audio: AUDIO_ENABLED ? 'loading' : 'off', whisperModel: WHISPER_MODEL_NAME }

// The LLM runs one job at a time, so checks wait in line.
let queue = Promise.resolve()
function inQueue (job) {
  const run = queue.then(job, job)
  queue = run.catch(() => {})
  return run
}

// ---- Small helpers ----------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' }

async function readBody (req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('File too large'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function sendJson (res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

// Start a streamed reply: each send(event) writes one JSON line.
function startStream (res) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
  return (event) => res.write(JSON.stringify(event) + '\n')
}

// Runs rules + AI on text and streams the events. `extra` is merged into the final event.
async function streamAnalysis (send, text, sender, extra = {}) {
  let lastProgress = 0
  const { both, timing } = await analyse(text, {
    sender,
    useLlm: status.llm === 'ready',
    onRules: (_r, rulesBoth) => send({ type: 'rules', result: rulesBoth, aiPending: status.llm === 'ready' }),
    onToken: (raw) => {
      // Throttle progress events to ~2 per second.
      if (Date.now() - lastProgress > 500) {
        lastProgress = Date.now()
        send({ type: 'ai-progress', chars: raw.length })
      }
    }
  })
  send({ type: 'final', result: both, timing: { ...timing, ...extra.timing }, source: extra.source || 'text' })
  return timing
}

// ---- Route handlers ---------------------------------------------------------
async function handleCheckText (req, res) {
  const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
  const text = String(body.text || '').trim().slice(0, MAX_TEXT_CHARS)
  const sender = String(body.sender || '').trim().slice(0, 40)
  if (!text) return sendJson(res, 400, { error: 'Please paste a message first.' })

  const send = startStream(res)
  await inQueue(async () => {
    const timing = await streamAnalysis(send, text, sender)
    console.log(`[check-text] total ${timing.totalMs}ms`)
  })
  res.end()
}

async function handleCheckAudio (req, res) {
  if (status.audio !== 'ready') {
    return sendJson(res, 503, { error: status.audio === 'off' ? 'Voice notes are turned off on this computer.' : 'Voice notes are still loading. Please wait.' })
  }
  const name = decodeURIComponent(String(req.headers['x-filename'] || 'voice.wav'))
  const ext = AUDIO_EXT[extname(name).toLowerCase()]
  if (!ext) return sendJson(res, 415, { error: 'Please use an .ogg, .opus, .mp3, .m4a or .wav file.' })

  const data = await readBody(req, MAX_UPLOAD_BYTES)
  await mkdir(UPLOAD_DIR, { recursive: true })
  const filePath = join(UPLOAD_DIR, `${randomUUID()}${ext}`)
  await writeFile(filePath, data)

  const send = startStream(res)
  try {
    await inQueue(async () => {
      const start = performance.now()
      send({ type: 'transcribing' })
      const { text, ms: transcribeMs } = await transcribeFile(filePath)
      send({ type: 'transcript', text })
      if (!text) {
        send({ type: 'error', error: 'No speech was found in this recording.' })
        return
      }
      const timing = await streamAnalysis(send, text, '', { source: 'voice', timing: { transcribeMs } })
      const totalMs = Math.round(performance.now() - start)
      console.log(`[check-audio] transcription ${transcribeMs}ms | analysis ${timing.totalMs}ms | total ${totalMs}ms`)
    })
  } finally {
    await unlink(filePath).catch(() => {}) // never keep people's recordings
  }
  res.end()
}

async function serveStatic (req, res) {
  const urlPath = new URL(req.url, 'http://localhost').pathname
  const file = resolve(PUBLIC_DIR, '.' + (urlPath === '/' ? '/index.html' : urlPath))
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' })
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    sendJson(res, 404, { error: 'Not found' })
  }
}

// ---- Server -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/status') return sendJson(res, 200, status)
    if (req.method === 'POST' && req.url === '/api/check-text') return await handleCheckText(req, res)
    if (req.method === 'POST' && req.url === '/api/check-audio') return await handleCheckAudio(req, res)
    if (req.method === 'GET') return await serveStatic(req, res)
    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    console.error('[server]', err)
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong. Please try again.' })
    else { res.write(JSON.stringify({ type: 'error', error: 'Something went wrong. Please try again.' }) + '\n'); res.end() }
  }
})

// Only listen on this computer (127.0.0.1), not the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Chunga is running at http://localhost:${PORT}`)
  console.log(AUDIO_ENABLED ? `Voice notes: on (${WHISPER_MODEL_NAME})` : 'Voice notes: off (set CHUNGA_AUDIO=on to enable)')
})

// Load models ONCE at startup, in the background. Text checks work with
// rules only until the AI is ready.
initLlm()
  .then(() => { status.llm = 'ready' })
  .catch((err) => { status.llm = 'error'; console.error('[llm] failed to load:', err.message) })
  .then(() => {
    // Load Whisper after the LLM so the two downloads/loads don't fight for memory.
    if (!AUDIO_ENABLED) return
    return initWhisper()
      .then(() => { status.audio = 'ready' })
      .catch((err) => { status.audio = 'error'; console.error('[whisper] failed to load:', err.message) })
  })
