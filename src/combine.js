// ============================================================================
// combine.js – how Chunga merges the RULES and the local AI into one answer.
//
// The rules are instant and never "hallucinate", but they only know patterns
// we wrote. The AI understands new wording, but a small model can be wrong.
// So the rules set a floor the AI cannot go below:
//
//   1. STRONG rule hit (asks for PIN/OTP, "send it back" reversal, fake
//      customer-care number, fake M-PESA message from a phone number)
//        → verdict is SCAM, whatever the AI says.
//   2. WEAK rule hits only (urgency, links, prize/loan/job wording, …)
//        → at least SUSPICIOUS, and the AI's confidence is raised.
//          If the weak hits add up to a SCAM-level score on their own
//          (e.g. "you won" + "pay a fee"), the verdict is SCAM.
//   3. NO rule hits
//        → trust the AI, but the AI alone can say at most SUSPICIOUS.
//          SCAM always needs at least one rule hit. (In our eval the small
//          1B model called normal family/friend messages SCAM at 100%.)
//   If the AI is unavailable or its answer can't be read → rules only.
// ============================================================================
import { RULES, verdictFromScore } from './detect/rules.js'

// Rule codes that are strong enough to decide SCAM on their own.
export const STRONG_CODES = ['ASKS_PIN', 'SEND_BACK', 'FAKE_AGENT', 'SENDER_MISMATCH']

// Order of severity, so we can say "at least SUSPICIOUS".
const LEVEL = { SAFE: 0, SUSPICIOUS: 1, SCAM: 2 }
const atLeast = (verdict, floor) => (LEVEL[verdict] >= LEVEL[floor] ? verdict : floor)

// Words in an AI red flag that mean it's the same thing a rule already found.
// Used only to avoid showing the same red flag twice.
const SAME_AS_RULE = {
  ASKS_PIN: /\b(pin|otp|code|password|siri)\b/i,
  SEND_BACK: /\b(mistake|send (it )?back|refund|revers|rudisha|kimakosa)\b/i,
  UPFRONT_FEE: /\b(fee|ada|pay first)\b/i,
  FAKE_PRIZE: /\b(won|prize|winner|reward|zawadi)\b/i,
  LOAN_JOB_OFFER: /\b(loan|job|mkopo|kazi)\b/i,
  THREAT_BLOCK: /\b(block|suspend|deactivat|close)\w*/i,
  URGENCY: /\b(urgent|urgency|hurry|quick|fast|haraka|immediately)\b/i,
  HAS_LINK: /\b(link|website|url|site)\b/i,
  CALL_NUMBER: /\b(phone number|call|number)\b/i,
  FAKE_AGENT: /\b(customer care|agent|safaricom|staff|impersonat)\w*/i,
  SENDER_MISMATCH: /\b(sender|official)\b/i,
  NEW_NUMBER: /\b(new number|changed (their|his|her)? ?number)\b/i
}

// How sure the rules alone are, from their 0–100 score.
function rulesConfidence (verdict, score) {
  if (verdict === 'SCAM') return Math.min(99, Math.round(70 + score / 3.5))
  if (verdict === 'SUSPICIOUS') return 60
  return score === 0 ? 70 : 55
}

/**
 * @param rules  { codes: string[], score: number }  from runRules()
 * @param ai     parsed AI answer from parseLlmOutput(), or null
 * @returns      { verdict, confidence, flags: [{ source: 'rule'|'ai', code?, text? }], decidedBy, ai }
 */
export function combine (rules, ai) {
  const strongHits = rules.codes.filter((c) => STRONG_CODES.includes(c))
  const weakHits = rules.codes.filter((c) => !STRONG_CODES.includes(c))
  const rulesVerdict = verdictFromScore(rules.score)

  let verdict
  let confidence
  let decidedBy

  if (!ai) {
    // No usable AI answer → rules only.
    verdict = rulesVerdict
    confidence = rulesConfidence(verdict, rules.score)
    decidedBy = 'rules only'
  } else if (strongHits.length > 0) {
    // Case 1: strong rule hit → always SCAM.
    verdict = 'SCAM'
    confidence = ai.verdict === 'SCAM'
      ? Math.max(ai.confidence, rulesConfidence('SCAM', rules.score))
      : rulesConfidence('SCAM', rules.score)
    decidedBy = ai.verdict === 'SCAM' ? 'rules + AI agree' : 'strong rule overrides AI'
  } else if (weakHits.length > 0) {
    // Case 2: weak rule hits → at least SUSPICIOUS, SCAM if the weak hits add up.
    verdict = atLeast(ai.verdict, rulesVerdict === 'SCAM' ? 'SCAM' : 'SUSPICIOUS')
    if (verdict === ai.verdict) {
      // AI agrees with (or goes beyond) the rules: boost its confidence a little per hit.
      confidence = Math.min(99, ai.confidence + 5 * weakHits.length)
    } else {
      // Rules raised the AI's verdict: use the rules' confidence.
      confidence = rulesConfidence(verdict, rules.score)
    }
    decidedBy = verdict === ai.verdict ? 'AI, boosted by rules' : 'rules raised AI verdict'
  } else {
    // Case 3: no rule hits → trust the AI, capped at SUSPICIOUS.
    if (ai.verdict === 'SCAM') {
      verdict = 'SUSPICIOUS'
      confidence = 60
      decidedBy = 'AI only (capped at SUSPICIOUS)'
    } else {
      verdict = ai.verdict
      confidence = ai.confidence
      decidedBy = 'AI'
    }
  }

  // Merge red flags: rule flags first (they have checked EN/SW text), then any
  // AI flags that say something new. Each one is labelled with its source.
  const flags = rules.codes.map((code) => ({ source: 'rule', code }))
  for (const text of ai?.red_flags ?? []) {
    const duplicate =
      rules.codes.some((code) => SAME_AS_RULE[code]?.test(text)) ||
      flags.some((f) => f.source === 'ai' && f.text.toLowerCase() === text.toLowerCase())
    // AI flags are only shown when the AI also thinks something is wrong.
    if (!duplicate && ai.verdict !== 'SAFE') flags.push({ source: 'ai', text })
  }

  return { verdict, confidence, flags, decidedBy, ai }
}

// Rule codes sorted by weight (strongest first), used when choosing what to show.
export const RULE_WEIGHT = Object.fromEntries(RULES.map((r) => [r.code, r.weight]))
