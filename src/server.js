// Chunga local web server. Everything runs on this computer: no cloud, no internet
// needed once the models are downloaded (npm run setup-models).
//
//   npm start            → http://localhost:3000
//   CHUNGA_AI=off        → rules only, no LLM (instant, less memory)
//   CHUNGA_AUDIO=on      → also load Whisper for voice notes
//                          (off by default: QVAC's speech engine crashes on CPUs
//                          without AVX/AVX2, and the crash would stop the LLM too)
//
// API (each check streams back newline-delimited JSON, one event per line):
//   GET  /api/status                       → { llm, audio }
//   POST /api/check-text   {text, sender}  → rules → ai-progress… → final
//   POST /api/check-audio  (raw file body,
//        header X-Filename)                → transcript → rules → ai-progress… → final
//   POST /api/check-image  (raw file body,
//        header X-Filename)                → ocr-text → rules → ai-progress… → final
// OCR loads on the first screenshot (not at startup) to save memory on small laptops.
//   POST /api/speak  {lang, verdict, reasonCodes} → audio/wav (needs CHUNGA_TTS=on;
//        like Whisper, QVAC's TTS engine crashes on CPUs without AVX/AVX2)
import http from 'node:http'
import { readFile, writeFile, mkdir, unlink, rm } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { analyse } from './detect/analyse.js'
import { initLlm } from './qvac/llm.js'
import { initWhisper, transcribeFile, WHISPER_MODEL_NAME } from './qvac/transcribe.js'
import { readImage } from './qvac/ocr.js'
import { speakSentences } from './qvac/tts.js'
import { spokenSentences } from './detect/spoken.js'

const PORT = Number(process.env.PORT || 3000)
const ROOT = resolve(import.meta.dirname, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const UPLOAD_DIR = join(ROOT, 'uploads')
const AUDIO_ENABLED = process.env.CHUNGA_AUDIO === 'on'
const TTS_ENABLED = process.env.CHUNGA_TTS === 'on'
const AI_ENABLED = process.env.CHUNGA_AI !== 'off'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB is plenty for a voice note
const MAX_TEXT_CHARS = 2000

// Audio types QVAC can decode itself (from its FORMATS_NEEDING_DECODE list).
// WhatsApp ".opus" voice notes are Ogg files, so we save them as ".ogg".
const AUDIO_EXT = { '.mp3': '.mp3', '.m4a': '.m4a', '.ogg': '.ogg', '.opus': '.ogg', '.oga': '.ogg', '.wav': '.wav', '.flac': '.flac', '.aac': '.aac' }
// Image types QVAC OCR reads (PNG / JPEG / BMP, from the @qvac/ocr-ggml docs).
const IMAGE_EXT = { '.png': '.png', '.jpg': '.jpg', '.jpeg': '.jpg', '.bmp': '.bmp' }

// ---- Model status, shown in the UI ("Loading AI…") -------------------------
const status = { llm: AI_ENABLED ? 'loading' : 'off', audio: AUDIO_ENABLED ? 'loading' : 'off', image: 'on-demand', tts: TTS_ENABLED ? 'on-demand' : 'off', whisperModel: WHISPER_MODEL_NAME }

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
    if (size > limit) throw Object.assign(new Error(ERRORS.TOO_LARGE), { status: 413, code: 'TOO_LARGE' })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function sendJson (res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

// Errors the user can see. The page shows each `code` in English or Swahili
// (public/app.js, UI.*.errors); the English text here is a fallback.
const ERRORS = {
  EMPTY_TEXT: 'Please paste a message first.',
  TOO_LARGE: 'This file is too large. Please use a file under 25 MB.',
  VOICE_OFF: 'Voice notes are turned off on this computer.',
  VOICE_LOADING: 'Voice notes are still loading. Please wait.',
  BAD_AUDIO_TYPE: 'Please use an .ogg, .opus, .mp3, .m4a or .wav file.',
  NO_SPEECH: 'No speech was found in this recording.',
  BAD_IMAGE_TYPE: 'Please use a .png or .jpg screenshot.',
  NO_IMAGE_TEXT: 'No text was found in this picture.',
  TTS_OFF: 'Reading aloud is turned off on this computer.',
  NOTHING_TO_READ: 'Nothing to read.',
  GENERIC: 'Something went wrong. Please try again.'
}
const errorBody = (code) => ({ code, error: ERRORS[code] })
const sendError = (res, httpStatus, code) => sendJson(res, httpStatus, errorBody(code))

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
  if (!text) return sendError(res, 400, 'EMPTY_TEXT')

  const send = startStream(res)
  await inQueue(async () => {
    const timing = await streamAnalysis(send, text, sender)
    console.log(`[check-text] total ${timing.totalMs}ms`)
  })
  res.end()
}

async function handleCheckAudio (req, res) {
  if (status.audio !== 'ready') {
    return sendError(res, 503, status.audio === 'off' ? 'VOICE_OFF' : 'VOICE_LOADING')
  }
  const name = decodeURIComponent(String(req.headers['x-filename'] || 'voice.wav'))
  const ext = AUDIO_EXT[extname(name).toLowerCase()]
  if (!ext) return sendError(res, 415, 'BAD_AUDIO_TYPE')

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
        send({ type: 'error', ...errorBody('NO_SPEECH') })
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

async function handleCheckImage (req, res) {
  const name = decodeURIComponent(String(req.headers['x-filename'] || 'screenshot.png'))
  const ext = IMAGE_EXT[extname(name).toLowerCase()]
  if (!ext) return sendError(res, 415, 'BAD_IMAGE_TYPE')

  const data = await readBody(req, MAX_UPLOAD_BYTES)
  await mkdir(UPLOAD_DIR, { recursive: true })
  const filePath = join(UPLOAD_DIR, `${randomUUID()}${ext}`)
  await writeFile(filePath, data)

  const send = startStream(res)
  try {
    await inQueue(async () => {
      const start = performance.now()
      send({ type: 'reading-image' })
      const { text, ms: ocrMs } = await readImage(filePath)
      status.image = 'ready'
      send({ type: 'ocr-text', text })
      if (!text) {
        send({ type: 'error', ...errorBody('NO_IMAGE_TEXT') })
        return
      }
      const timing = await streamAnalysis(send, text, '', { source: 'image', timing: { ocrMs } })
      const totalMs = Math.round(performance.now() - start)
      console.log(`[check-image] ocr ${ocrMs}ms | analysis ${timing.totalMs}ms | total ${totalMs}ms`)
    })
  } finally {
    await unlink(filePath).catch(() => {}) // never keep people's screenshots
  }
  res.end()
}

async function handleSpeak (req, res) {
  if (!TTS_ENABLED) return sendError(res, 503, 'TTS_OFF')
  const body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}')
  const lang = body.lang === 'sw' ? 'sw' : 'en'
  // Rebuild the sentences from our own fixed text; never speak text sent by the page.
  const sentences = spokenSentences({ verdict: body.verdict, reasonCodes: Array.isArray(body.reasonCodes) ? body.reasonCodes : [] }, lang)
  if (!sentences.length) return sendError(res, 400, 'NOTHING_TO_READ')

  const { wav, ms } = await inQueue(() => speakSentences(sentences, lang))
  status.tts = 'ready'
  console.log(`[speak] ${lang} ${sentences.length} sentences, generated in ${ms}ms (0 = all cached)`)
  res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length })
  res.end(wav)
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
    if (req.method === 'POST' && req.url === '/api/check-image') return await handleCheckImage(req, res)
    if (req.method === 'POST' && req.url === '/api/speak') return await handleSpeak(req, res)
    if (req.method === 'GET') return await serveStatic(req, res)
    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    // A bad JSON body: Node's error message quotes part of the body (which may
    // be the user's message), so don't log it.
    if (err instanceof SyntaxError) {
      console.error('[server] request body was not valid JSON')
      return sendError(res, 400, 'GENERIC')
    }
    console.error('[server]', err)
    if (!res.headersSent) sendError(res, err.status || 500, err.code && ERRORS[err.code] ? err.code : 'GENERIC')
    else { res.write(JSON.stringify({ type: 'error', ...errorBody('GENERIC') }) + '\n'); res.end() }
  }
})

// Uploads are deleted after each check; this also removes any left behind if
// the app was closed or crashed in the middle of a check.
await rm(UPLOAD_DIR, { recursive: true, force: true })

// Only listen on this computer (127.0.0.1), not the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Chunga is running at http://localhost:${PORT}`)
  console.log(AUDIO_ENABLED ? `Voice notes: on (${WHISPER_MODEL_NAME})` : 'Voice notes: off (set CHUNGA_AUDIO=on to enable)')
})

// Load models ONCE at startup, in the background. Text checks work with
// rules only until the AI is ready. CHUNGA_AI=off skips the LLM entirely
// (rules only: instant, and ~0.8 GB less memory on small laptops).
const llmReady = AI_ENABLED
  ? initLlm()
    .then(() => { status.llm = 'ready' })
    .catch((err) => { status.llm = 'error'; console.error('[llm] failed to load:', err.message) })
  : Promise.resolve()
llmReady
  .then(() => {
    // Load Whisper after the LLM so the two downloads/loads don't fight for memory.
    if (!AUDIO_ENABLED) return
    return initWhisper()
      .then(() => { status.audio = 'ready' })
      .catch((err) => { status.audio = 'error'; console.error('[whisper] failed to load:', err.message) })
  })
