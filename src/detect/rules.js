// Rule-based red-flag detector.
//
// Each rule looks for one known scam pattern (English, Swahili or Sheng) and
// returns a reason code. Reason codes are turned into plain-language
// explanations in messages.js, so the wording is always the same and works in
// both languages. The weights decide how much each red flag counts.

// A phone number: +254 / 254 / 0, then 7xx or 1xx, with optional spaces or dashes.
// "X" is allowed as a digit so our masked test numbers also match.
const PHONE = /(\+?254|\b0)\s?[17][\dx]{2}[\s-]?[\dx]{3}[\s-]?[\dx]{3}\b/i

// Words that mean "don't" in front of a request ("do not share your PIN").
// If one of these comes just before a match, the message is a warning, not a request.
const NEGATION = /\b(not|never|don'?t|usi\w*|kamwe|wala)\b[^.!?]{0,25}$/i

// Returns true if `pattern` matches `text` somewhere that is NOT just after a negation.
function matchesWithoutNegation (text, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index)
    if (!NEGATION.test(before)) return true
  }
  return false
}

// True when the sender looks like a personal phone number (not a short code or name like "MPESA").
function senderIsPhoneNumber (sender) {
  return Boolean(sender) && /^[+\d][\d\sx-]{8,}$/i.test(sender.trim())
}

// ---------------------------------------------------------------------------
// The rules. `test(text, ctx)` gets the lower-cased message and { sender }.
// ---------------------------------------------------------------------------
export const RULES = [
  {
    // Asking for a PIN, OTP or verification code. The #1 red flag.
    code: 'ASKS_PIN',
    weight: 70,
    test: (t) =>
      matchesWithoutNegation(t,
        /\b(send|share|give|tell|provide|enter|confirm|reply with|forward|read|tuma|nitumie|nipe|niambie|taja|weka|ingiza)\b[^.!?]{0,40}\b(pin|otp|one[- ]time (password|pin|code)|verification code|security code|password|code|namba (yako )?ya siri|nambari ya siri|msimbo)\b/) ||
      matchesWithoutNegation(t, /\b(pin|code|namba ya siri)\b[^.!?]{0,30}\b(we have just sent|we sent|uliyotumiwa|uliyopokea|nimetuma)\b/)
  },
  {
    // "I sent you money by mistake, please send it back" (fake reversal).
    code: 'SEND_BACK',
    weight: 65,
    test: (t) => {
      const giveBack = /\b(send (it |the money |my money )?back|return (it|the money|my money)|refund me|reverse it|rudisha|nirudishie|irudishe|hujarudisha|rejesha)\b/.test(t)
      const mistake = /\b(by mistake|mistakenly|accidentally|in error|wrong number|kimakosa|kwa makosa|nimekosea|nilikosea)\b/.test(t)
      const money = /\b(ksh|kes|sh|pesa|doh|money|cash|\d[\d,]{2,})\b/.test(t)
      return giveBack || (mistake && money)
    }
  },
  {
    // Pay a "fee" first to receive a loan, prize or job.
    code: 'UPFRONT_FEE',
    weight: 55,
    test: (t) =>
      /\b(processing|registration|application|activation|clearance|insurance|withdrawal|release|unlock|medical and uniform)\s+(fee|charge)s?\b/.test(t) ||
      /\b(ada ya|lipa ada)\b/.test(t) ||
      /\b(send|pay|tuma|lipa)\s+(ksh|kes|sh)\.?\s?[\d,]+\b[^.!?]{0,40}\b(fee|to (receive|activate|release|unlock|claim|secure)|ili)\b/.test(t)
  },
  {
    // "You have won" / "Umeshinda" / prizes and rewards out of nowhere.
    code: 'FAKE_PRIZE',
    weight: 40,
    test: (t) => /\b(you have won|you've won|congratulations|dear winner|winner|umeshinda|hongera|zawadi|prize|lucky draw|jackpot|cash reward|redeem|you have been selected|umechaguliwa|free \d+\s?gb|claim (it|your|now|at))\b/.test(t)
  },
  {
    // Easy loans or jobs offered by SMS.
    code: 'LOAN_JOB_OFFER',
    weight: 35,
    test: (t) => /\b(qualified for (an? )?(instant )?loan|instant loan|loan (approved|offer)|no crb|umepata mkopo|mkopo wa|bila guarantor|job opportunity|job offer|vacancy|nafasi ya kazi|work from home|earn (ksh|kes)[^.!?]{0,15}(daily|per day|kila siku))\b/.test(t)
  },
  {
    // Threat that the account, line or SIM will be blocked.
    code: 'THREAT_BLOCK',
    weight: 35,
    test: (t) =>
      /\b(account|line|sim|akaunti|laini|pin)\b[^.!?]{0,40}\b(blocked|suspended|deactivated|deactivation|closed|frozen|expire|itafungwa|itazimwa|imefungwa|imesimamishwa)\b/.test(t) ||
      /\b(to avoid deactivation|nitakuripoti)\b/.test(t)
  },
  {
    // Pressure to act fast.
    code: 'URGENCY',
    weight: 25,
    test: (t) => /\b(urgent|urgently|immediately|right now|within \d+ (hours|hrs|minutes|mins)|in \d+ hours|today only|expires? today|before midnight|last chance|act now|only \d+ slots|haraka|sasa hivi|mara moja|kabla ya saa|leo tu)\b/.test(t)
  },
  {
    // A web link. Scammers use look-alike sites to steal PINs.
    code: 'HAS_LINK',
    weight: 25,
    test: (t) => /(https?:\/\/|www\.|\bbit\.ly\b|\btinyurl\b|\b[a-z0-9-]+\.(xyz|top|site|online|link|click|live|info|com|net)\b)/.test(t)
  },
  {
    // "Call / WhatsApp / send to 07XX..." – a personal number posing as customer care or a winner's office.
    code: 'CALL_NUMBER',
    weight: 30,
    test: (t) => new RegExp(String.raw`\b(call|piga|contact|reach|whatsapp|wasiliana|send|tuma|kwa)\b[^.!?]{0,40}` + PHONE.source, 'i').test(t)
  },
  {
    // Claims to be from Safaricom / M-PESA / customer care, but in a personal message.
    code: 'FAKE_AGENT',
    weight: 35,
    test: (t, ctx) => {
      const claims = /\b(this is \w+ from (safaricom|m-?pesa)|from (safaricom|m-?pesa) (customer care|head office)|calling from (safaricom|m-?pesa)|kutoka (safaricom|m-?pesa|huduma kwa wateja)|huduma kwa wateja|safaricom customer care|our (agent|officer))\b/.test(t)
      return claims && (senderIsPhoneNumber(ctx.sender) || PHONE.test(t))
    }
  },
  {
    // "New number" trick: a friend or relative "changed numbers" and suddenly needs money.
    code: 'NEW_NUMBER',
    weight: 40,
    test: (t) => /\b(new number|changed my number|nimebadilisha namba|namba (yangu )?mpya|hii ni namba yangu)\b/.test(t)
  },
  {
    // Looks like an official M-PESA message, but came from a normal phone number.
    code: 'SENDER_MISMATCH',
    weight: 60,
    test: (t, ctx) => senderIsPhoneNumber(ctx.sender) && /\b(confirmed\.|m-pesa balance|transaction cost)/.test(t)
  }
]

// Run every rule on a message. Returns the matched reason codes and a 0–100 score.
export function runRules (text, { sender = '' } = {}) {
  const t = String(text).toLowerCase().replace(/\s+/g, ' ')
  const matched = RULES.filter((rule) => rule.test(t, { sender }))
  const score = Math.min(100, matched.reduce((sum, rule) => sum + rule.weight, 0))
  return {
    codes: matched.map((rule) => rule.code),
    score
  }
}

// Turn a rule score into a verdict. 60+ = SCAM, 25+ = SUSPICIOUS, else SAFE.
export function verdictFromScore (score) {
  if (score >= 60) return 'SCAM'
  if (score >= 25) return 'SUSPICIOUS'
  return 'SAFE'
}
