// QVAC local LLM: loads the model once and asks it to classify a message.
//
// QVAC APIs used (from @qvac/sdk 0.22.0 docs):
//   loadModel()   – load the GGUF model into memory (downloads it the first time)
//   completion()  – run the model; we stream `contentDelta` events and read `final`
//   unloadModel() – free memory when the app shuts down
// `responseFormat: { type: 'json_schema' }` makes llama.cpp constrain the output
// with a grammar, so the model can only produce JSON in our exact shape.
import * as sdk from '@qvac/sdk'
import { loadModel, completion, unloadModel } from '@qvac/sdk'

// ---- Settings (all names come from the QVAC llamacpp config schema) --------
// CHUNGA_LLM lets you try another QVAC model constant without editing code.
export const LLM_MODEL = sdk[process.env.CHUNGA_LLM || 'LLAMA_3_2_1B_INST_Q4_0']
export const LLM_CONFIG = {
  device: 'cpu', // the Intel iGPU was ~10x slower than CPU on our test laptop
  ctx_size: 2048, // small context = less memory, faster
  temp: 0.1,
  seed: 42
}
const MAX_OUTPUT_TOKENS = 250
const MAX_INPUT_CHARS = 600 // long messages are cut so the prompt stays small
// Few-shot examples cost ~110 prompt tokens each, which is slow on old CPUs.
const NUM_EXAMPLES = Number(process.env.CHUNGA_EXAMPLES ?? 3)
// Qwen3 models "think" before answering; reasoning_budget 0 turns that off.
const IS_QWEN3 = (process.env.CHUNGA_LLM || '').startsWith('QWEN3')

// ---- Output shape (the grammar forces this JSON) ---------------------------
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['SCAM', 'SUSPICIOUS', 'SAFE'] },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    red_flags: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 3 },
    explanation_en: { type: 'string', maxLength: 160 },
    explanation_sw: { type: 'string', maxLength: 160 },
    advice: { type: 'array', items: { type: 'string', maxLength: 70 }, maxItems: 2 }
  },
  required: ['verdict', 'confidence', 'red_flags', 'explanation_en', 'explanation_sw', 'advice'],
  additionalProperties: false
}

// ---- Prompt: short system prompt + 3 tiny examples (few-shot) --------------
const SYSTEM_PROMPT =
  'You check SMS and WhatsApp messages from Kenya (English, Swahili or Sheng) for mobile-money scams. ' +
  'Scam signs: asks for PIN or code, money "sent by mistake" to send back, prizes, loans or jobs that need a fee, ' +
  'threats to block an account, a personal number posing as Safaricom. ' +
  'Most messages are normal: chats, family news, receipts, and warnings like "do not share your PIN". ' +
  'If there is no scam sign, answer SAFE. ' +
  'Reply only with JSON. Use short, simple sentences for older readers.'

const EXAMPLES = [
  {
    msg: 'Nimekutumia 2,000 kimakosa, tafadhali nirudishie kwa 07XX XXX 908.',
    out: { verdict: 'SCAM', confidence: 95, red_flags: ['money sent by mistake', 'asks you to send it back'], explanation_en: 'This is a fake reversal trick. They want you to send your own money.', explanation_sw: 'Huu ni ujanja wa kurudisha pesa. Wanataka utume pesa yako.', advice: ['Do not send money', 'Check your balance yourself'] }
  },
  {
    msg: 'This is Safaricom customer care. Tell me the code we just sent to keep your line active.',
    out: { verdict: 'SCAM', confidence: 97, red_flags: ['asks for a secret code', 'fake customer care'], explanation_en: 'Safaricom never asks for your code or PIN.', explanation_sw: 'Safaricom haiombi namba yako ya siri.', advice: ['Do not share the code', 'Hang up'] }
  },
  {
    msg: 'Mum nimefika salama Nakuru, nitakupigia jioni.',
    out: { verdict: 'SAFE', confidence: 90, red_flags: [], explanation_en: 'A normal family message. It asks for nothing.', explanation_sw: 'Ujumbe wa kawaida wa familia. Hauombi chochote.', advice: ['No action needed'] }
  }
]

function buildHistory (text, sender) {
  const history = [{ role: 'system', content: SYSTEM_PROMPT }]
  for (const ex of EXAMPLES.slice(0, NUM_EXAMPLES)) {
    history.push({ role: 'user', content: `Message: ${ex.msg}` })
    history.push({ role: 'assistant', content: JSON.stringify(ex.out) })
  }
  const clipped = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '…' : text
  const from = sender ? `Sender: ${sender}\n` : ''
  history.push({ role: 'user', content: `${from}Message: ${clipped}` })
  return history
}

// ---- Model lifecycle: load ONCE, reuse for every request -------------------
let modelId = null
let loading = null

export function isLlmReady () {
  return modelId !== null
}

export async function initLlm ({ onProgress } = {}) {
  if (modelId) return modelId
  if (!loading) {
    const t0 = Date.now()
    loading = loadModel({ modelSrc: LLM_MODEL, modelConfig: LLM_CONFIG, onProgress })
      .then((id) => {
        modelId = id
        console.log(`[llm] model loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
        return id
      })
      .catch((err) => { loading = null; throw err })
  }
  return loading
}

export async function closeLlm () {
  if (modelId) await unloadModel({ modelId })
  modelId = null
  loading = null
}

// ---- Classify one message ---------------------------------------------------
// onToken(textSoFar) is called while the model streams, so the UI can show progress.
// onRun(run) receives the QVAC run as soon as it starts (its `requestId` can be
// passed to cancel() to stop a slow answer).
// Returns { raw, timing } – parsing/validation happens in parse.js.
export async function askLlm (text, { sender = '', onToken, onRun, kvCache = false } = {}) {
  const id = await initLlm()
  const start = performance.now()
  let firstTokenMs = null
  let raw = ''

  const run = completion({
    modelId: id,
    history: buildHistory(text, sender),
    stream: true,
    kvCache,
    responseFormat: { type: 'json_schema', json_schema: { name: 'chunga_result', schema: RESULT_SCHEMA } },
    generationParams: {
      temp: LLM_CONFIG.temp,
      seed: LLM_CONFIG.seed,
      predict: MAX_OUTPUT_TOKENS,
      ...(IS_QWEN3 ? { reasoning_budget: 0 } : {})
    }
  })
  onRun?.(run)

  for await (const event of run.events) {
    if (event.type === 'contentDelta') {
      if (firstTokenMs === null) firstTokenMs = performance.now() - start
      raw += event.text
      onToken?.(raw)
    }
  }
  const final = await run.final
  const timing = {
    firstTokenMs: Math.round(firstTokenMs ?? 0),
    totalMs: Math.round(performance.now() - start),
    promptTokens: final.stats?.promptTokens,
    generatedTokens: final.stats?.generatedTokens,
    tokensPerSecond: final.stats?.tokensPerSecond,
    cacheTokens: final.stats?.cacheTokens,
    backend: final.stats?.backendDevice
  }
  return { raw: final.contentText || raw, timing }
}
