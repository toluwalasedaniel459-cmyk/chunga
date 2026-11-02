// Safely turns the LLM's text into a clean object, or returns null.
//
// QVAC's JSON-schema grammar already forces valid JSON, but we still guard
// against surprises (cut-off output, extra text, odd values) so a bad answer
// can never crash the app – the caller then falls back to the rules.

const VERDICTS = ['SCAM', 'SUSPICIOUS', 'SAFE']

// Try to fix small, common JSON mistakes.
function repair (s) {
  let out = s
    .replace(/[“”]/g, '"') // curly double quotes → "
    .replace(/[‘’]/g, "'") // curly single quotes → '
    .replace(/,\s*([}\]])/g, '$1') // trailing commas
  // Close any brackets/braces left open (e.g. output cut off by the token limit).
  const quotes = (out.match(/(?<!\\)"/g) || []).length
  if (quotes % 2 === 1) out += '"'
  const opens = []
  for (const ch of out) {
    if (ch === '{' || ch === '[') opens.push(ch)
    if (ch === '}' || ch === ']') opens.pop()
  }
  while (opens.length) out += opens.pop() === '{' ? '}' : ']'
  return out
}

function toStringList (value, max) {
  if (!Array.isArray(value)) return []
  return value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()).slice(0, max)
}

// Returns { verdict, confidence, red_flags, explanation_en, explanation_sw, advice } or null.
export function parseLlmOutput (raw) {
  if (typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  if (start === -1) return null
  const end = raw.lastIndexOf('}')
  const candidate = end > start ? raw.slice(start, end + 1) : raw.slice(start)

  let obj = null
  for (const attempt of [candidate, repair(candidate), repair(raw.slice(start))]) {
    try { obj = JSON.parse(attempt); break } catch { /* try the next fix */ }
  }
  if (!obj || typeof obj !== 'object') return null

  // Validate and normalise each field.
  let verdict = String(obj.verdict ?? '').toUpperCase().replace('LOOKS ', '').trim()
  if (!VERDICTS.includes(verdict)) return null

  let confidence = Number(obj.confidence)
  if (!Number.isFinite(confidence)) confidence = 60
  if (confidence > 0 && confidence <= 1) confidence *= 100 // model used a 0–1 scale
  confidence = Math.max(0, Math.min(100, Math.round(confidence)))

  return {
    verdict,
    confidence,
    red_flags: toStringList(obj.red_flags, 3),
    explanation_en: typeof obj.explanation_en === 'string' ? obj.explanation_en.trim() : '',
    explanation_sw: typeof obj.explanation_sw === 'string' ? obj.explanation_sw.trim() : '',
    advice: toStringList(obj.advice, 3)
  }
}
