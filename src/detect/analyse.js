// Turns a message into a full Chunga result: verdict, confidence, reasons, advice.
//
// Flow:  rules (instant)  →  local QVAC LLM  →  combine()  →  user-facing result
import { runRules } from './rules.js'
import { parseLlmOutput } from './parse.js'
import { combine } from '../combine.js'
import { askLlm } from '../qvac/llm.js'
import { buildResult } from './result.js'

export { buildResult }

/**
 * Analyse one message.
 * @param text     the message
 * @param options  sender (optional), lang 'en'|'sw', useLlm (default true),
 *                 onRules(result, both) – called instantly with the rules-only result,
 *                 onToken(rawSoFar) – called while the AI streams
 * @returns        { result, both: { en, sw }, rulesResult, timing, aiRaw }
 *                 `both` lets the UI switch language without asking the AI again.
 */
export async function analyse (text, { sender = '', lang = 'en', useLlm = true, onRules, onToken } = {}) {
  const start = performance.now()
  const inBoth = (combined) => ({ en: buildResult(combined, 'en'), sw: buildResult(combined, 'sw') })

  // 1. Rules first: instant, so the user sees something straight away.
  const rules = runRules(text, { sender })
  const rulesBoth = inBoth(combine(rules, null))
  const rulesResult = rulesBoth[lang]
  const rulesMs = performance.now() - start
  onRules?.(rulesResult, rulesBoth)

  if (!useLlm) {
    return { result: rulesResult, both: rulesBoth, rulesResult, timing: { rulesMs, totalMs: rulesMs }, aiRaw: null }
  }

  // 2. Local AI. Any failure (model error, unreadable JSON) falls back to the rules.
  let ai = null
  let aiRaw = null
  let llmTiming = {}
  try {
    const answer = await askLlm(text, { sender, onToken })
    aiRaw = answer.raw
    llmTiming = answer.timing
    ai = parseLlmOutput(answer.raw)
    // Log only the length: the AI's answer can quote the user's message.
    if (!ai) console.warn(`[analyse] could not read AI answer (${answer.raw.length} chars), using rules only`)
  } catch (err) {
    console.warn('[analyse] AI failed, using rules only:', err.message)
  }

  // 3. Combine rules + AI.
  const both = inBoth(combine(rules, ai))
  const result = both[lang]
  const timing = { rulesMs: Number(rulesMs.toFixed(2)), ...llmTiming, totalMs: Math.round(performance.now() - start) }
  console.log(`[timing] rules ${timing.rulesMs}ms | first token ${timing.firstTokenMs ?? '-'}ms | total ${timing.totalMs}ms | ${result.verdict} (${result.decidedBy})`)
  return { result, both, rulesResult, timing, aiRaw }
}
