# Chunga – demo video script (2–3 minutes)

**Before recording**

- Run `npm run setup-models` (online), then `npm start` once, so the models are downloaded and cached.
- Use a PC with **AVX2** if you can (`npm run check-cpu`): voice notes only work there, and the AI is faster.
- Start the app with voice notes on: `$env:CHUNGA_AUDIO="on"; npm start`. Wait until the yellow "Loading AI…" box disappears.
- Have ready:
  - the fake reversal SMS (below), copied to the clipboard
  - a fake "Safaricom agent" voice note, e.g. `data/audio/audio-scam-agent.wav`, or better, your own Swahili recording from `data/audio/RECORDING_SCRIPT.md`
  - `src/combine.js` and `src/qvac/llm.js` open in an editor
  - a terminal with the eval numbers (`npm run eval -- --rules` runs instantly; the full numbers are in the README)
- Close other apps and notifications. Browser zoom 125–150% so the phone UI is readable on video.

**Honesty rules for the video**

- **Don't speed up or cut AI waiting time without saying so.** If you cut, show a caption such as
  *"AI double-check took 2 min 30 s on this laptop. Cut for time."*
- If the spoken warning isn't built yet (TTS, not started), skip that beat. Don't fake it.

Fake reversal SMS to paste (synthetic, sender optional: `+2547XX XXX 214`):

```
SJK4H7XQ2P Confirmed. You have received Ksh 3,500.00 from JOHN KAMAU 07XX XXX 214 on 12/10/26 at 3:41 PM. New M-PESA balance is Ksh 3,612.00.
```

Follow-up message (the actual trick):

```
Hello, I have sent you 3,500 by mistake, it was meant for my mother's hospital bill. Please send it back to 07XX XXX 214. God bless you.
```

---

## Script

| Time | On screen | Say |
|---|---|---|
| **0:00–0:20** | Title card: *Chunga – "watch out"*. Then a phone showing a fake M-PESA SMS. | "In Kenya, mobile money is everyday money, and scammers know it. 'I sent you money by mistake, send it back.' 'This is Safaricom, tell me the code.' Older and first-time users lose savings to messages like these. Chunga checks them, in English or Swahili, and it runs completely offline." |
| **0:20–0:35** | Taskbar: **switch Wi-Fi off** on camera, show the "not connected" icon. Then the Chunga page. | "Everything runs on this laptop with QVAC: no cloud AI, no account, nothing leaves the device. I'm turning Wi-Fi off now." |
| **0:35–1:10** | **Paste message** tab: paste the follow-up SMS, sender `+2547XX XXX 214`, press **Check message**. The red **SCAM** card appears instantly; "AI is double-checking…" counter runs; (caption if cut) final card: *Decided by: rules + AI agree*. | "I paste the message. Chunga answers straight away: SCAM. It asks you to send money back, and that's the reversal trick. Meanwhile the local AI double-checks… and agrees. Each reason says whether it came from a rule or the AI, and the advice is simple: don't reply, don't send money, check your balance yourself." |
| **1:10–1:20** | Tap **SW**: the same result switches to Swahili instantly. | "One tap for Swahili." |
| **1:20–1:55** | **Voice note** tab → **Choose a voice note** → the fake agent clip. Show "Listening to the voice note…", then **What we heard** (the transcript), then the verdict with the *From voice note* label. | "Scams also come as calls and voice notes. Here's a fake Safaricom agent. QVAC's Whisper model turns it into text on the laptop, offline, and the same checks run on it. It asks for the code we just sent: SCAM." |
| **1:55–2:05** | *(Only if text-to-speech is built.)* Tap the speak button; the Swahili warning plays. | "And Chunga can read the warning aloud in Swahili for people who find reading hard." |
| **2:05–2:30** | Editor: `src/qvac/llm.js`, highlight `loadModel` and `completion` with `responseFormat: json_schema`. Then `src/combine.js`, highlight the three cases. | "Under the hood: QVAC loads a 1-billion-parameter Llama model once, and a JSON schema forces it to answer in our format. A small model can be wrong, so rules set a floor: a PIN request or a 'send it back' is always a scam, and the AI alone can never shout SCAM." |
| **2:30–2:50** | README eval table, or the terminal output of the eval. | "On our 36-message test set, no scam was marked safe, with rules plus AI at 89% exact accuracy. We're honest about the limits too: we wrote the test set ourselves, and on an old laptop the AI takes a couple of minutes, while the rules answer instantly." |
| **2:50–3:00** | Logo + repo link. | "Chunga: own your AI, protect your money." |

## If something goes wrong while recording

- **"Voice notes are turned off"** → you started without `CHUNGA_AUDIO=on`, or the PC has no AVX2. Do the voice beat on an AVX2 PC, or drop it and say voice notes are in the repo.
- **"The AI could not start"** → restart `npm start` with Wi-Fi **on** once (to finish any download), then turn Wi-Fi off and start again.
- **Very slow AI** → close the browser tabs you don't need and other apps; RAM is usually the cause.
