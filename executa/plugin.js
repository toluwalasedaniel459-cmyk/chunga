#!/usr/bin/env node
// Chunga – Anna Executa plugin (protocol 1.1: JSON-RPC 2.0 over stdio).
//
// One tool, `check_message`: is this SMS / WhatsApp message a mobile-money
// scam? Rules answer instantly; the local QVAC LLM (in ai-worker.js) double-
// checks when it is loaded. All AI runs on this machine – no cloud calls.
//
// stdout carries protocol frames ONLY (one JSON object per line). Every log
// goes to stderr, which the Anna Agent shows in its trace view.
//
// Environment:
//   CHUNGA_AI=off           rules only, never start the AI (instant, less memory)
//   CHUNGA_AI_BUDGET_MS     max time to wait for the AI per check (default 150000)
import readline from 'node:readline'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runRules } from './lib/detect/rules.js'
import { parseLlmOutput } from './lib/detect/parse.js'
import { combine } from './lib/combine.js'
import { buildResult, LANGUAGES } from './lib/detect/result.js'
import { SPOKEN_VERDICT } from './lib/detect/messages.js'

// Anything printed with console.log would corrupt the protocol stream.
console.log = console.error

const VERSION = '1.0.0'
const TOOL_TIMEOUT_S = 180
const AI_BUDGET_MS = Number(process.env.CHUNGA_AI_BUDGET_MS || 150000)
const AI_ENABLED = process.env.CHUNGA_AI !== 'off'
const MAX_CHARS = 2000

const MANIFEST = {
  name: 'chunga',
  display_name: 'Chunga – Scam Checker',
  version: VERSION,
  description: 'Checks whether an SMS or WhatsApp message is a mobile-money scam (fake M-PESA reversals, fake Safaricom agents, PIN/OTP requests, fake prizes, loans and jobs). Returns a SCAM / SUSPICIOUS / SAFE verdict with a confidence level, the red flags it found, a plain-language explanation and what to do next, in English, Swahili or Nigerian Pidgin. Rules answer instantly and a local QVAC LLM double-checks on the device: no cloud AI, the message never leaves the machine.',
  author: 'The Chunga team',
  homepage: 'https://github.com/toluwalasedaniel459-cmyk/chunga',
  icon: '🛡️',
  category: 'security',
  license: 'MIT',
  tools: [
    {
      name: 'check_message',
      description: 'Check if a text message (SMS, WhatsApp, or a transcript of a call/voice note) is a mobile-money scam. Use it whenever the user shares a message and asks whether it is real, safe, a scam or fraud, or what to do about it. Understands English, Swahili and Sheng. Returns verdict (SCAM, SUSPICIOUS or SAFE), confidence (0-100), red_flags, explanation and advice. Pass the message text exactly as the user gave it.',
      timeout: TOOL_TIMEOUT_S,
      streaming: false,
      parameters: [
        { name: 'message', type: 'string', description: 'The full text of the message to check, exactly as received.', required: true },
        { name: 'language', type: 'string', description: 'Language for the explanation and advice: en (English), sw (Swahili) or pcm (Nigerian Pidgin).', required: false, default: 'en', enum: LANGUAGES }
      ]
    }
  ],
  runtime: { type: 'node', min_version: '22.17.0' }
}

// ---- Local AI helper process ------------------------------------------------
let aiState = AI_ENABLED ? 'starting' : 'off' // starting | loading | ready | error | off
let aiMessage = ''
let worker = null
const waiting = new Map() // ask id → resolve
let nextAskId = 1

function startWorker () {
  worker = fork(fileURLToPath(new URL('./ai-worker.js', import.meta.url)), [], {
    // stdin closed, stdout + stderr → our stderr, plus the IPC channel.
    stdio: ['ignore', 2, 2, 'ipc'],
    env: { QVAC_RPC_INIT_TIMEOUT_MS: '120000', ...process.env }
  })
  worker.on('message', (msg) => {
    if (msg.type === 'state') {
      aiState = msg.state
      aiMessage = msg.message || ''
      console.error(`[chunga] AI ${aiState}${aiMessage ? `: ${aiMessage}` : ''}`)
    } else if (waiting.has(msg.id)) {
      waiting.get(msg.id)(msg)
      waiting.delete(msg.id)
    }
  })
  worker.on('exit', (code, signal) => {
    if (aiState !== 'off') {
      aiState = 'error'
      aiMessage = `AI process stopped (${signal || `exit ${code}`}); answering with rules only`
      console.error(`[chunga] ${aiMessage}`)
    }
    for (const resolve of waiting.values()) resolve({ type: 'failed', message: aiMessage })
    waiting.clear()
    worker = null
  })
}

// Ask the AI, or resolve null at once if it isn't ready (rules answer instead).
function askAi (text) {
  if (aiState !== 'ready' || !worker) return Promise.resolve(null)
  return new Promise((resolve) => {
    const id = nextAskId++
    waiting.set(id, resolve)
    worker.send({ type: 'ask', id, text, budgetMs: AI_BUDGET_MS })
  })
}

// ---- The tool ---------------------------------------------------------------
async function checkMessage (args) {
  const message = typeof args.message === 'string' ? args.message.trim() : ''
  if (!message) return { success: false, error: 'The "message" argument is required: pass the text of the message to check.' }
  const language = args.language == null || args.language === '' ? 'en' : String(args.language).toLowerCase()
  if (!LANGUAGES.includes(language)) return { success: false, error: `Unsupported language "${args.language}". Use one of: ${LANGUAGES.join(', ')}.` }

  const start = performance.now()
  const text = message.slice(0, MAX_CHARS)

  // 1. Rules: instant.
  const rules = runRules(text)

  // 2. Local AI, if loaded. Any AI problem falls back to the rules.
  let ai = null
  let aiNote = aiState === 'ready' ? '' : `AI ${aiState}`
  const answer = await askAi(text)
  if (answer?.type === 'answer') {
    ai = parseLlmOutput(answer.raw)
    if (!ai) aiNote = 'AI answer could not be read'
  } else if (answer) {
    aiNote = answer.message
  }
  if (aiNote) console.error(`[chunga] rules only: ${aiNote}`)

  // 3. Combine (see combine.js: rules set a floor the AI can't go below).
  const r = buildResult(combine(rules, ai), language)
  const explanation = [SPOKEN_VERDICT[r.verdict][language], r.reasons[0]?.text, r.summary].filter(Boolean).join(' ')
  const durationMs = Math.round(performance.now() - start)
  console.error(`[chunga] ${r.verdict} ${r.confidence}% (${r.decidedBy}) in ${durationMs} ms`)

  return {
    success: true,
    data: {
      verdict: r.verdict,
      confidence: r.confidence,
      red_flags: r.reasons.map((x) => x.text),
      explanation,
      advice: r.advice,
      label: r.label,
      language,
      decided_by: r.decidedBy,
      ai_used: Boolean(ai),
      red_flag_details: r.reasons.map((x) => ({ text: x.text, source: x.source, code: x.code }))
    },
    duration_ms: durationMs
  }
}

// ---- JSON-RPC over stdio ----------------------------------------------------
function send (id, payload) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...payload }) + '\n')
}

async function handle (req) {
  if (req.method === 'describe') return send(req.id, { result: MANIFEST })
  if (req.method === 'health') {
    return send(req.id, {
      result: {
        // Rules always work, so the tool is usable even while the AI loads.
        status: 'ready',
        message: aiState === 'ready' ? '' : `Rules ready; local AI ${aiState}${aiMessage ? ` (${aiMessage})` : ''}`,
        details: { ai: aiState, version: VERSION }
      }
    })
  }
  if (req.method === 'invoke') {
    const params = req.params || {}
    if (params.tool !== 'check_message') return send(req.id, { error: { code: -32601, message: `Unknown tool: ${params.tool}` } })
    let result
    try {
      result = await checkMessage(params.arguments || {})
    } catch (err) {
      console.error('[chunga] check failed:', err)
      result = { success: false, error: 'Chunga could not check this message. Please try again.' }
    }
    return send(req.id, { result })
  }
  return send(req.id ?? null, { error: { code: -32601, message: `Unknown method: ${req.method}` } })
}

// Requests run one after another, in order (the local AI handles one at a time).
let queue = Promise.resolve()
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let req
  try {
    req = JSON.parse(trimmed)
  } catch {
    return send(null, { error: { code: -32700, message: 'Parse error' } })
  }
  if (!req || typeof req !== 'object' || typeof req.method !== 'string') {
    return send(req?.id ?? null, { error: { code: -32600, message: 'Invalid request' } })
  }
  // describe / health answer immediately; invokes wait their turn.
  if (req.method === 'invoke') queue = queue.then(() => handle(req)).catch((err) => console.error('[chunga]', err))
  else handle(req).catch((err) => console.error('[chunga]', err))
})

// stdin EOF = the Agent asks us to stop. Finish queued checks, then exit.
rl.on('close', () => { queue.finally(shutdown) })
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

let stopping = false
function shutdown () {
  if (stopping) return
  stopping = true
  // Flush stdout first (pipe writes can be asynchronous), then exit cleanly.
  const exit = () => process.stdout.write('', () => process.exit(0))
  if (!worker) return exit()
  aiState = 'off'
  worker.once('exit', exit)
  worker.disconnect() // the AI helper frees the model and exits
  setTimeout(() => { worker?.kill(); exit() }, 4000).unref() // within the Agent's 5 s grace period
}

// Start loading the AI only after we're listening, so `describe` (5 s limit)
// is never delayed by the model.
if (AI_ENABLED) setImmediate(startWorker)
