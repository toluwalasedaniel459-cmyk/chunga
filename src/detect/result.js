// Builds the user-facing result (verdict label, reasons, advice) in one
// language: 'en' (English), 'sw' (Swahili) or 'pcm' (Nigerian Pidgin).
// Kept separate from analyse.js so it can be used without loading QVAC.
import { RULE_WEIGHT } from '../combine.js'
import { VERDICT_LABELS, REASONS, ADVICE } from './messages.js'

export const LANGUAGES = ['en', 'sw', 'pcm']

export function buildResult (combined, lang = 'en') {
  const { verdict, confidence, flags, decidedBy, ai } = combined

  // Up to 3 reasons: strongest rule flags first, then new AI flags.
  const ruleFlags = flags.filter((f) => f.source === 'rule').sort((a, b) => RULE_WEIGHT[b.code] - RULE_WEIGHT[a.code])
  let aiFlags = flags.filter((f) => f.source === 'ai')
  // The small AI writes its flags in English only. In other languages we show
  // one checked sentence instead, so users only see our own text.
  if (lang !== 'en' && aiFlags.length) aiFlags = [{ source: 'ai', code: 'AI_FLAGGED' }]
  let shown = [...ruleFlags, ...aiFlags].slice(0, 3)
  if (shown.length === 0) shown = [{ source: 'rule', code: verdict === 'SAFE' ? 'NO_RED_FLAGS' : 'AI_FLAGGED' }]

  const reasons = shown.map((f) => ({
    source: f.source,
    code: f.code ?? null,
    // Coded flags use our checked text; uncoded ones are the AI's English text.
    text: f.code ? REASONS[f.code][lang] : f.text
  }))

  // The AI's one-line summary, only when it agrees with the final verdict
  // (otherwise it would contradict what we show). English only: the 1B
  // model's Swahili was often wrong in our tests.
  const summary = ai && ai.verdict === verdict && lang === 'en' ? ai.explanation_en : ''

  return {
    verdict,
    label: VERDICT_LABELS[verdict][lang],
    confidence,
    reasons,
    summary,
    advice: ADVICE[verdict].map((a) => a[lang]), // hand-written, so always clear
    decidedBy,
    lang
  }
}
