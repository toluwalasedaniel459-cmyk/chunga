// QVAC local text-to-speech: reads the verdict aloud in English or Swahili.
//
// QVAC APIs used (from @qvac/sdk 0.22.0):
//   loadModel()     – Chatterbox multilingual (T3 + S3Gen GGUFs); Swahili is `sw`
//   textToSpeech()  – text → 16-bit PCM samples (`buffer`) + `sampleRate`
//   unloadModel()   – free memory / switch language
//
// The language is part of the model config, so switching EN ↔ SW reloads the
// model. Everything we speak is fixed text, so each sentence is generated once
// and cached as a WAV file in tts-cache/ (instant replays, reliable demos).
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  loadModel, textToSpeech, unloadModel,
  TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0, TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0
} from '@qvac/sdk'

export const TTS_MODELS = [TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0, TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0]
const CACHE_DIR = resolve(import.meta.dirname, '../../tts-cache')

let modelId = null
let modelLang = null
let loading = null

// Load (or switch) the TTS model for one language.
export async function initTts (lang = 'en') {
  if (modelId && modelLang === lang) return modelId
  if (loading) await loading.catch(() => {})
  if (modelId && modelLang === lang) return modelId
  loading = (async () => {
    if (modelId) await unloadModel({ modelId })
    modelId = null
    const t0 = Date.now()
    modelId = await loadModel({
      modelSrc: TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0,
      modelType: 'tts',
      modelConfig: {
        ttsEngine: 'chatterbox',
        language: lang,
        s3genModelSrc: TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0,
        ttsSpeed: 0.9 // a little slower: easier for older listeners
      }
    })
    modelLang = lang
    console.log(`[tts] Chatterbox (${lang}) loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    return modelId
  })()
  try { return await loading } finally { loading = null }
}

export async function closeTts () {
  if (modelId) await unloadModel({ modelId })
  modelId = null
  modelLang = null
}

// 16-bit mono PCM → WAV file bytes.
function pcmToWav (samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s))), i * 2))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

// Speak one sentence. Returns { samples, sampleRate, cached, ms }.
export async function speakSentence (text, lang) {
  const key = createHash('sha1').update(`${lang}|${text}`).digest('hex').slice(0, 16)
  const file = join(CACHE_DIR, `${lang}-${key}.wav`)
  try {
    const wav = await readFile(file)
    const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2))
    return { samples, sampleRate: wav.readUInt32LE(24), cached: true, ms: 0 }
  } catch { /* not cached yet */ }

  const id = await initTts(lang)
  const start = performance.now()
  const run = textToSpeech({ modelId: id, text, inputType: 'text', stream: false })
  const samples = await run.buffer
  const sampleRate = (await run.sampleRate) || 24000
  const ms = Math.round(performance.now() - start)
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(file, pcmToWav(samples, sampleRate))
  return { samples, sampleRate, cached: false, ms }
}

// Speak several sentences with a short pause between them → one WAV.
export async function speakSentences (sentences, lang) {
  const parts = []
  let sampleRate = 24000
  let ms = 0
  for (const s of sentences) {
    const r = await speakSentence(s, lang)
    sampleRate = r.sampleRate
    ms += r.ms
    parts.push(...r.samples, ...new Array(Math.round(sampleRate * 0.35)).fill(0))
  }
  return { wav: pcmToWav(parts, sampleRate), ms }
}
