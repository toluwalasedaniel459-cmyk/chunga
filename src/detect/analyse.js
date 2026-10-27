// Turns a message into a full Chunga result: verdict, confidence, reasons, advice.
//
// Step 1: rules only. Step 2 will add the local QVAC LLM and combine the two
// (rules can raise or override the LLM so results stay stable).
import { runRules, verdictFromScore } from './rules.js'
import { VERDICT_LABELS, REASONS, ADVICE } from './messages.js'

// How sure we are, from the rule score (0–100). Kept simple on purpose.
function confidenceFromScore (verdict, score) {
  if (verdict === 'SCAM') return Math.min(0.99, 0.7 + score / 350)
  if (verdict === 'SUSPICIOUS') return 0.6
  return score === 0 ? 0.7 : 0.55
}

// Build the user-facing result in the chosen language ('en' or 'sw').
export function buildResult ({ verdict, confidence, codes, source }, lang = 'en') {
  // Show at most 3 reasons, strongest first (rules are already ordered by weight).
  const shownCodes = codes.length ? codes.slice(0, 3) : ['NO_RED_FLAGS']
  return {
    verdict,
    label: VERDICT_LABELS[verdict][lang],
    confidence: Math.round(confidence * 100),
    reasonCodes: shownCodes,
    reasons: shownCodes.map((code) => REASONS[code][lang]),
    advice: ADVICE[verdict].map((a) => a[lang]),
    source,
    lang
  }
}

// Analyse one message. `sender` is optional (e.g. "MPESA" or "+2547...").
export function analyse (text, { sender = '', lang = 'en' } = {}) {
  const rules = runRules(text, { sender })
  const verdict = verdictFromScore(rules.score)
  return buildResult({
    verdict,
    confidence: confidenceFromScore(verdict, rules.score),
    codes: rules.codes,
    source: 'rules'
  }, lang)
}
