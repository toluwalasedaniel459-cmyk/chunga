// Chunga web app. Talks only to the local server on this computer.
'use strict'

// ---- Interface text in English and Swahili ---------------------------------
const UI = {
  en: {
    tagline: 'Check a message before you trust it',
    offline: 'Works offline · nothing leaves this device',
    tabText: 'Paste message',
    tabVoice: 'Voice note',
    tabImage: 'Screenshot',
    imageBtn: 'Choose a screenshot',
    imageHint: 'A picture of the message (.png or .jpg)',
    pasteLabel: 'Paste the SMS or WhatsApp message',
    pastePlaceholder: 'e.g. I have sent you Ksh 2,000 by mistake…',
    senderLabel: 'Who sent it? (optional)',
    senderPlaceholder: 'e.g. MPESA or 0712…',
    checkBtn: 'Check message',
    voiceOff: 'Voice notes are turned off on this computer.',
    uploadBtn: 'Choose a voice note',
    uploadHint: 'WhatsApp voice notes (.ogg / .opus), .mp3, .m4a or .wav',
    or: 'or',
    recordBtn: 'Record from microphone',
    stopBtn: 'Stop and check',
    transcriptTitle: 'What we heard',
    fromVoice: 'From voice note',
    readTitle: 'What we read',
    fromImage: 'From screenshot',
    aiChecking: 'The offline AI is double-checking…',
    whyTitle: 'Why',
    doTitle: 'What to do',
    againBtn: 'Check another message',
    speakBtn: 'Read aloud',
    speakWorking: (s) => `Preparing the voice… ${s}s`,
    speakError: 'Could not read aloud. Please try again.',
    footer: "Chunga gives advice, not a guarantee. When in doubt, don't send money.",
    confidence: (n) => `Confidence: ${n}%`,
    aiLoading: 'Loading AI… You can already check messages with our quick rules.',
    aiError: 'The AI could not start. Quick rules still work.',
    checking: 'Checking…',
    uploading: 'Sending…',
    transcribing: 'Listening to the voice note…',
    readingImage: (s) => `Reading the screenshot… ${s}s`,
    aiWorking: (s) => `AI is reading the message… ${s}s`,
    emptyText: 'Please paste a message first.',
    micError: 'Could not use the microphone. Please choose a file instead.',
    recording: (s) => `Recording… ${s}s`,
    tagRule: 'rule',
    tagAi: 'AI',
    decidedBy: (d) => `Decided by: ${d}`,
    errorGeneric: 'Something went wrong. Please try again.'
  },
  sw: {
    tagline: 'Kagua ujumbe kabla ya kuuamini',
    offline: 'Inafanya kazi bila mtandao · hakuna kinachotoka kwenye kifaa',
    tabText: 'Bandika ujumbe',
    tabVoice: 'Ujumbe wa sauti',
    tabImage: 'Picha ya skrini',
    imageBtn: 'Chagua picha ya skrini',
    imageHint: 'Picha ya ujumbe (.png au .jpg)',
    pasteLabel: 'Bandika ujumbe wa SMS au WhatsApp',
    pastePlaceholder: 'mf. Nimekutumia Ksh 2,000 kimakosa…',
    senderLabel: 'Nani ametuma? (si lazima)',
    senderPlaceholder: 'mf. MPESA au 0712…',
    checkBtn: 'Kagua ujumbe',
    voiceOff: 'Ujumbe wa sauti umezimwa kwenye kompyuta hii.',
    uploadBtn: 'Chagua ujumbe wa sauti',
    uploadHint: 'Sauti za WhatsApp (.ogg / .opus), .mp3, .m4a au .wav',
    or: 'au',
    recordBtn: 'Rekodi kwa maikrofoni',
    stopBtn: 'Simamisha na ukague',
    transcriptTitle: 'Tulichosikia',
    fromVoice: 'Kutoka ujumbe wa sauti',
    readTitle: 'Tulichosoma',
    fromImage: 'Kutoka picha ya skrini',
    aiChecking: 'AI ya nje ya mtandao inakagua tena…',
    whyTitle: 'Kwa nini',
    doTitle: 'Ufanye nini',
    againBtn: 'Kagua ujumbe mwingine',
    speakBtn: 'Soma kwa sauti',
    speakWorking: (s) => `Inaandaa sauti… sekunde ${s}`,
    speakError: 'Imeshindwa kusoma kwa sauti. Tafadhali jaribu tena.',
    footer: 'Chunga inatoa ushauri, si uhakika. Ukiwa na shaka, usitume pesa.',
    confidence: (n) => `Uhakika: ${n}%`,
    aiLoading: 'AI inapakia… Unaweza kukagua ujumbe kwa sheria zetu za haraka.',
    aiError: 'AI imeshindwa kuanza. Sheria za haraka bado zinafanya kazi.',
    checking: 'Inakagua…',
    uploading: 'Inatuma…',
    transcribing: 'Inasikiliza ujumbe wa sauti…',
    readingImage: (s) => `Inasoma picha ya skrini… sekunde ${s}`,
    aiWorking: (s) => `AI inasoma ujumbe… sekunde ${s}`,
    emptyText: 'Tafadhali bandika ujumbe kwanza.',
    micError: 'Imeshindwa kutumia maikrofoni. Tafadhali chagua faili.',
    recording: (s) => `Inarekodi… sekunde ${s}`,
    tagRule: 'sheria',
    tagAi: 'AI',
    decidedBy: (d) => `Imeamuliwa na: ${d}`,
    errorGeneric: 'Kuna tatizo. Tafadhali jaribu tena.'
  }
}

const $ = (id) => document.getElementById(id)
let lang = 'en'
let lastResult = null // { en, sw } – kept so the language toggle can redraw instantly
let lastSource = 'text'
let aiPending = false
let busy = false

const t = (key, ...args) => {
  const v = UI[lang][key]
  return typeof v === 'function' ? v(...args) : v
}

// ---- Language ---------------------------------------------------------------
function applyLanguage () {
  document.documentElement.lang = lang
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n) })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder) })
  document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)))
  if (recorder) $('record-label').textContent = t('stopBtn')
  renderStatus()
  if (lastResult) renderResult(lastResult, lastSource)
}
document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang
  try { localStorage.setItem('chunga-lang', lang) } catch { /* private mode */ }
  applyLanguage()
}))
try { lang = localStorage.getItem('chunga-lang') || 'en' } catch { /* private mode */ }

// ---- Tabs -------------------------------------------------------------------
document.querySelectorAll('.tabs button').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b === tab)))
  for (const name of ['text', 'voice', 'image']) $('panel-' + name).hidden = tab.dataset.tab !== name
}))

// ---- Model status ("Loading AI…") ------------------------------------------
let status = { llm: 'loading', audio: 'off' }
function renderStatus () {
  const box = $('ai-status')
  if (status.llm === 'loading') { box.hidden = false; box.textContent = t('aiLoading') } else if (status.llm === 'error') { box.hidden = false; box.textContent = t('aiError') } else box.hidden = true
  const voiceOn = status.audio === 'ready'
  $('voice-off').hidden = voiceOn
  $('audio-file').disabled = !voiceOn
  $('record').disabled = !voiceOn || busy
}
async function pollStatus () {
  try {
    status = await (await fetch('/api/status')).json()
    renderStatus()
  } catch { /* server restarting */ }
  if (status.llm === 'loading' || status.audio === 'loading') setTimeout(pollStatus, 3000)
}

// ---- Progress ---------------------------------------------------------------
let timer = null
function showProgress (text) {
  $('progress').hidden = false
  $('progress-text').textContent = text
}
function startAiTimer (key = 'aiWorking') {
  const start = Date.now()
  clearInterval(timer)
  timer = setInterval(() => showProgress(t(key, Math.round((Date.now() - start) / 1000))), 1000)
}
function stopProgress () {
  clearInterval(timer)
  $('progress').hidden = true
}

// ---- Result -----------------------------------------------------------------
function renderResult (both, source) {
  const r = both[lang]
  $('result').hidden = false
  $('result-source').hidden = source === 'text'
  $('result-source').textContent = source === 'image' ? t('fromImage') : t('fromVoice')
  $('verdict').className = `verdict ${r.verdict}`
  $('verdict-label').textContent = r.label
  $('verdict-confidence').textContent = t('confidence', r.confidence)
  $('ai-pending').hidden = !aiPending

  $('reasons').replaceChildren(...r.reasons.map((reason) => {
    const li = document.createElement('li')
    li.textContent = reason.text
    const tag = document.createElement('span')
    tag.className = 'tag'
    tag.textContent = reason.source === 'ai' ? t('tagAi') : t('tagRule')
    li.append(tag)
    return li
  }))
  $('summary').hidden = !r.summary
  $('summary').textContent = r.summary || ''
  $('advice').replaceChildren(...r.advice.map((a) => Object.assign(document.createElement('li'), { textContent: a })))
  $('decided-by').textContent = t('decidedBy', r.decidedBy)
  $('speak').hidden = status.tts === 'off' || status.tts === undefined
}

function resetResult () {
  lastResult = null
  aiPending = false
  $('result').hidden = true
  $('transcript-box').hidden = true
}

function setBusy (value) {
  busy = value
  $('check-text').disabled = value
  renderStatus()
}

// Reads the server's stream of JSON lines and updates the screen for each event.
async function readStream (response, source) {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || t('errorGeneric'))
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) handleEvent(JSON.parse(line), source)
    }
  }
}

function handleEvent (ev, source) {
  if (ev.type === 'transcribing') showProgress(t('transcribing'))
  if (ev.type === 'reading-image') startAiTimer('readingImage')
  if (ev.type === 'ocr-text') {
    $('transcript-box').hidden = false
    $('transcript-title').textContent = t('readTitle')
    $('transcript').textContent = ev.text || '—'
  }
  if (ev.type === 'transcript') {
    $('transcript-title').textContent = t('transcriptTitle')
    $('transcript-box').hidden = false
    $('transcript').textContent = ev.text || '—'
  }
  if (ev.type === 'rules') {
    // Instant answer from the rules; the AI may still be working.
    aiPending = ev.aiPending
    lastResult = ev.result
    lastSource = source
    renderResult(ev.result, source)
    if (aiPending) startAiTimer(); else stopProgress()
  }
  if (ev.type === 'final') {
    aiPending = false
    lastResult = ev.result
    lastSource = ev.source || source
    stopProgress()
    renderResult(ev.result, lastSource)
  }
  if (ev.type === 'error') throw new Error(ev.error)
}

async function runCheck (makeRequest, source) {
  resetResult()
  setBusy(true)
  try {
    await readStream(await makeRequest(), source)
  } catch (err) {
    stopProgress()
    alertBox(err.message)
  } finally {
    aiPending = false
    if (lastResult) renderResult(lastResult, lastSource)
    setBusy(false)
  }
}

function alertBox (message) {
  const box = $('ai-status')
  box.hidden = false
  box.textContent = message
}

// ---- Text check -------------------------------------------------------------
$('check-text').addEventListener('click', () => {
  const text = $('message').value.trim()
  if (!text) return alertBox(t('emptyText'))
  showProgress(t('checking'))
  runCheck(() => fetch('/api/check-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sender: $('sender').value.trim() })
  }), 'text')
})

$('again').addEventListener('click', () => {
  resetResult()
  $('message').value = ''
  $('sender').value = ''
  $('message').focus()
})

// ---- Voice note upload ------------------------------------------------------
function sendAudio (blob, filename) {
  showProgress(t('uploading'))
  runCheck(() => fetch('/api/check-audio', {
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(filename), 'Content-Type': 'application/octet-stream' },
    body: blob
  }), 'voice')
}
$('audio-file').addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (file) sendAudio(file, file.name)
  e.target.value = ''
})

// ---- Screenshot upload ------------------------------------------------------
let previewUrl = null
$('image-file').addEventListener('change', (e) => {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  // Show the picture so the user knows which one is being checked.
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = URL.createObjectURL(file)
  $('image-preview').src = previewUrl
  $('image-preview').hidden = false
  showProgress(t('uploading'))
  runCheck(() => fetch('/api/check-image', {
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
    body: file
  }), 'image')
})

// ---- Microphone recording → 16 kHz mono WAV --------------------------------
// Browsers record WebM, which QVAC doesn't read, so we capture raw samples and
// build a WAV file ourselves.
let recorder = null
$('record').addEventListener('click', async () => {
  if (recorder) return stopRecording()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const node = ctx.createScriptProcessor(4096, 1, 1)
    const chunks = []
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    source.connect(node)
    node.connect(ctx.destination)
    const started = Date.now()
    const tick = setInterval(() => { $('record-time').textContent = t('recording', Math.round((Date.now() - started) / 1000)) }, 500)
    recorder = { stream, ctx, node, chunks, tick }
    $('record').classList.add('recording')
    $('record-label').textContent = t('stopBtn')
  } catch {
    alertBox(t('micError'))
  }
})

function stopRecording () {
  const { stream, ctx, node, chunks, tick } = recorder
  recorder = null
  clearInterval(tick)
  node.disconnect()
  stream.getTracks().forEach((tr) => tr.stop())
  const wav = encodeWav(chunks, ctx.sampleRate, 16000)
  ctx.close()
  $('record').classList.remove('recording')
  $('record-label').textContent = t('recordBtn')
  $('record-time').textContent = ''
  sendAudio(wav, 'recording.wav')
}

// Joins the recorded chunks, resamples to 16 kHz and writes a 16-bit PCM WAV.
function encodeWav (chunks, inRate, outRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const input = new Float32Array(total)
  let offset = 0
  for (const c of chunks) { input.set(c, offset); offset += c.length }
  const ratio = inRate / outRate
  const out = new Int16Array(Math.floor(total / ratio))
  for (let i = 0; i < out.length; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const buffer = new ArrayBuffer(44 + out.length * 2)
  const v = new DataView(buffer)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, out.length * 2, true)
  new Int16Array(buffer, 44).set(out)
  return new Blob([buffer], { type: 'audio/wav' })
}

// ---- Read the result aloud (QVAC text-to-speech on the server) -----------
$('speak').addEventListener('click', async () => {
  if (!lastResult || busy) return
  const r = lastResult[lang]
  setBusy(true)
  $('speak').disabled = true
  startAiTimer('speakWorking')
  try {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only reason codes are sent; the server speaks its own fixed EN/SW text.
      body: JSON.stringify({ lang, verdict: r.verdict, reasonCodes: r.reasons.filter((x) => x.code).map((x) => x.code) })
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('speakError'))
    const audio = $('speak-audio')
    if (audio.src) URL.revokeObjectURL(audio.src)
    audio.src = URL.createObjectURL(await res.blob())
    stopProgress()
    await audio.play()
  } catch (err) {
    stopProgress()
    alertBox(err.message || t('speakError'))
  } finally {
    $('speak').disabled = false
    setBusy(false)
  }
})

// ---- Start ------------------------------------------------------------------
applyLanguage()
pollStatus()
