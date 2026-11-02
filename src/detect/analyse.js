// Turns a message into a full Chunga result: verdict, confidence, reasons, advice.
//
// Flow:  rules (instant)  →  local QVAC LLM  →  combine()  →  user-facing result
import { runRules } from './rules.js'
import { parseLlmOutput } from './parse.js'
import { combine, RULE_WEIGHT } from '../combine.js'
import { askLlm } from '../qvac/llm.js'
import { VERDICT_LABELS, REASONS, ADVICE } from './messages.js'

// Build the user-facing result in the chosen language ('en' or 'sw').
export function buildResult (combined, lang = 'en') {
  const { verdict, confidence, flags, decidedBy, ai } = combined

  // Up to 3 reasons: strongest rule flags first, then new AI flags.
  const ruleFlags = flags.filter((f) => f.source === 'rule').sort((a, b) => RULE_WEIGHT[b.code] - RULE_WEIGHT[a.code])
  let aiFlags = flags.filter((f) => f.source === 'ai')
  // The small AI writes its flags in English only. In Swahili we show one
  // checked Swahili sentence instead, so Swahili users only see our own text.
  if (lang === 'sw' && aiFlags.length) aiFlags = [{ source: 'ai', code: 'AI_FLAGGED' }]
  let shown = [...ruleFlags, ...aiFlags].slice(0, 3)
  if (shown.length === 0) shown = [{ source: 'rule', code: verdict === 'SAFE' ? 'NO_RED_FLAGS' : 'AI_FLAGGED' }]

  const reasons = shown.map((f) => ({
    source: f.source,
    code: f.code ?? null,
    // Coded flags use our checked EN/SW text; uncoded ones are the AI's English text.
    text: f.code ? REASONS[f.code][lang] : f.text
  }))

  // The AI's one-line summary, only when it agrees with the final verdict
  // (otherwise it would contradict what we show). Hidden in Swahili: the 1B
  // model's Swahili was often wrong in our tests.
  const summary = ai && ai.verdict === verdict && lang === 'en' ? ai.explanation_en : ''

  return {
    verdict,
    label: VERDICT_LABELS[verdict][lang],
    confidence,
    reasons,
    summary,
    advice: ADVICE[verdict].map((a) => a[lang]), // hand-written, so always clear in both languages
    decidedBy,
    lang
  }
}

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
    if (!ai) console.warn('[analyse] could not read AI answer, using rules only:', answer.raw.slice(0, 200))
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
