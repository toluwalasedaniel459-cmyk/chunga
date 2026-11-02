// Plain-language text for every verdict, reason code and piece of advice,
// in English (en) and Swahili (sw). Written by hand so the explanation is
// clear and correct even though the local LLM is small.
// Advice is deliberately generic: we do not hardcode hotline numbers.

export const VERDICT_LABELS = {
  SCAM: { en: 'SCAM', sw: 'NI UTAPELI' },
  SUSPICIOUS: { en: 'SUSPICIOUS', sw: 'UNATILIWA SHAKA' },
  SAFE: { en: 'LOOKS SAFE', sw: 'UNAONEKANA SALAMA' }
}

// First sentence when the result is read aloud.
export const SPOKEN_VERDICT = {
  SCAM: { en: 'Warning. This message is a scam.', sw: 'Tahadhari. Ujumbe huu ni utapeli.' },
  SUSPICIOUS: { en: 'Be careful. This message is suspicious.', sw: 'Kuwa mwangalifu. Ujumbe huu unatiliwa shaka.' },
  SAFE: { en: 'This message looks safe.', sw: 'Ujumbe huu unaonekana salama.' }
}

export const REASONS = {
  ASKS_PIN: {
    en: 'It asks for your PIN or a secret code. Real M-PESA staff never ask for this.',
    sw: 'Ujumbe unaomba PIN yako au namba ya siri uliyotumiwa kwa SMS. Wafanyakazi halisi wa M-PESA hawaombi hivi kamwe.'
  },
  SEND_BACK: {
    en: 'It says money was sent "by mistake" and asks you to send it back. This is a common reversal trick.',
    sw: 'Ujumbe unadai pesa ilitumwa kwako "kimakosa" na unakuomba uirudishe. Huu ni ujanja unaojulikana sana.'
  },
  UPFRONT_FEE: {
    en: 'It asks you to pay a "fee" first before you get a prize, loan or job.',
    sw: 'Ujumbe unakuomba ulipe "ada" kwanza kabla ya kupata zawadi, mkopo au kazi.'
  },
  FAKE_PRIZE: {
    en: 'It says you won a prize or reward you never entered for.',
    sw: 'Ujumbe unadai umeshinda zawadi katika shindano ambalo hukushiriki.'
  },
  LOAN_JOB_OFFER: {
    en: 'It offers an easy loan or job by message. Real lenders and employers do not work like this.',
    sw: 'Ujumbe unakupa mkopo au kazi kwa urahisi sana. Wakopeshaji na waajiri halisi hawafanyi hivi.'
  },
  THREAT_BLOCK: {
    en: 'It threatens that your account or line will be blocked to scare you.',
    sw: 'Ujumbe unatisha kwamba akaunti au laini yako itafungwa. Wanataka uogope.'
  },
  URGENCY: {
    en: 'It pushes you to act fast so you do not have time to think.',
    sw: 'Ujumbe unakuharakisha ili usipate muda wa kufikiri.'
  },
  HAS_LINK: {
    en: 'It has a web link. Fake sites can steal your PIN or money.',
    sw: 'Ujumbe una kiungo (link) cha tovuti. Tovuti bandia zinaweza kuiba PIN au pesa yako.'
  },
  CALL_NUMBER: {
    en: 'It asks you to call or send money to a personal phone number.',
    sw: 'Ujumbe unakuomba upige simu au utume pesa kwa namba ya mtu binafsi.'
  },
  FAKE_AGENT: {
    en: 'Someone claims to be from Safaricom or M-PESA, but uses a normal phone number.',
    sw: 'Mtu anadai kuwa mfanyakazi wa Safaricom au M-PESA, lakini anatumia namba ya kawaida ya simu.'
  },
  NEW_NUMBER: {
    en: 'Someone says they "changed their number" and asks for money. Call their old number to check.',
    sw: 'Mtu anadai "amebadilisha namba" na anaomba pesa. Mpigie kwa namba yake ya zamani ili uhakikishe.'
  },
  SENDER_MISMATCH: {
    en: 'It looks like an M-PESA message, but it came from a normal phone number, not the official sender.',
    sw: 'Ujumbe unaonekana kama wa M-PESA, lakini umetoka kwa namba ya kawaida ya simu, si kwa mtumaji rasmi.'
  },
  NO_RED_FLAGS: {
    en: 'We did not find common scam signs in this message.',
    sw: 'Hatukupata dalili za kawaida za utapeli katika ujumbe huu.'
  },
  AI_FLAGGED: {
    en: 'The offline AI thinks the message is trying to trick you.',
    sw: 'AI iliyo kwenye kifaa hiki inaona ujumbe huu unajaribu kukudanganya.'
  }
}

export const ADVICE = {
  SCAM: [
    { en: 'Do not reply or call back.', sw: 'Usijibu wala usimpigie simu.' },
    { en: 'Do not send money and never share your PIN.', sw: 'Usitume pesa, na kamwe usimpe mtu PIN yako.' },
    { en: 'Check your M-PESA balance yourself from your phone menu.', sw: 'Angalia salio lako la M-PESA mwenyewe kwenye menyu ya simu.' },
    { en: "Report it to your mobile provider's official fraud line, then delete it.", sw: 'Ripoti kwa namba rasmi ya kuripoti ulaghai ya kampuni yako ya simu, kisha ufute ujumbe.' }
  ],
  SUSPICIOUS: [
    { en: 'Do not send money or share any code yet.', sw: 'Usitume pesa wala usitoe namba yoyote ya siri kwa sasa.' },
    { en: 'Check your balance and transactions yourself.', sw: 'Angalia salio na miamala yako mwenyewe.' },
    { en: 'If unsure, ask someone you trust or contact your provider through official channels.', sw: 'Ukiwa na shaka, uliza mtu unayemwamini au wasiliana na kampuni yako ya simu kupitia njia rasmi.' }
  ],
  SAFE: [
    { en: 'This looks normal, but stay careful.', sw: 'Ujumbe huu unaonekana wa kawaida, lakini endelea kuwa mwangalifu.' },
    { en: 'Never share your PIN with anyone.', sw: 'Usimpe mtu yeyote PIN yako.' }
  ]
}
