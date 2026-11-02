# Privacy

Chunga checks private messages, so it is built to keep them on your device.
This page explains what happens to your data. It describes the code in this
repository; if you change the code, check that it still holds.

## In short

- **All AI runs on your computer** with the QVAC SDK. Chunga calls no cloud AI
  service and has no accounts, analytics, tracking or ads.
- **Your messages, voice notes and screenshots never leave your computer.**
- **Nothing you check is saved.** Uploaded files are deleted as soon as they
  have been read.
- **The only internet use is the one-time model download** (`npm run setup-models`).
  After that, Chunga works with Wi-Fi off (tested 2026-11-02).

## What happens to each kind of input

| Input | Where it goes | Kept? |
|---|---|---|
| **Pasted message** and optional sender | Sent from the page to the Chunga server on the same computer (`127.0.0.1`), checked by the rules and the local AI, in memory only | **No.** Never written to disk. It stays in the page until you press "Check another message" or close the tab. |
| **Voice note / mic recording** | Saved briefly in `uploads/` so QVAC Whisper can read it, then transcribed on the device | **No.** Deleted right after transcription, even if the check fails. `uploads/` is also emptied every time Chunga starts, in case it was closed mid-check. |
| **Screenshot** | Saved briefly in `uploads/` so QVAC OCR can read it | **No.** Deleted right after reading, as above. |
| **The result** (verdict, reasons, advice) | Shown on the page | **No.** Only in the page's memory. |

## What Chunga does store

| What | Where | Contains your data? |
|---|---|---|
| Your language choice (EN / SW) | Your browser's local storage (`chunga-lang`) | No, just `en` or `sw` |
| AI models | QVAC's model cache, `~/.qvac/models` | No, downloaded model files only |
| Spoken sentences for "Read aloud" | `tts-cache/` in the app folder | No. Only Chunga's own fixed sentences (verdict, reasons, advice) are ever spoken, never your message text. |
| Terminal log while Chunga runs | Shown in the terminal window only, not written to a file | No message text: only timings, verdicts and errors. We removed the two places that could have printed part of a message (an unreadable AI answer, and a broken request body). |

## Network

- The Chunga server listens only on `127.0.0.1` (this computer). Other devices
  on your Wi-Fi cannot reach it.
- The web page loads nothing from the internet: no fonts, scripts or images
  from other sites.
- **Model download:** `npm run setup-models` downloads the models through
  QVAC's model registry (QVAC uses peer-to-peer and HTTP sources for this).
  This sends no message content; it only fetches model files.
- When you are online, the QVAC SDK may contact its model registry, for example
  to fetch a model it doesn't have yet. Chunga never sends your messages, voice
  notes or screenshots to it. If you want to be certain nothing goes out, turn
  Wi-Fi off after setup: Chunga works fully offline.

## What we can't promise

- **Your phone or computer itself.** Chunga can't protect a device that already
  has malware, or messages you share elsewhere.
- **Third-party software.** We rely on the QVAC SDK and its engines, and on
  your web browser. We describe what our code does with your data; what those
  programs do internally is covered by their own documentation and licences.
- **Advice, not a guarantee.** Chunga can be wrong. When in doubt, don't send
  money, and contact your mobile provider through its official channels.

## Test data in this repository

All test messages, voice notes and screenshots in `data/` are synthetic: made up
by the Chunga team, with made-up names and amounts, and phone numbers masked as
`07XX XXX 123`. They contain no real person's data.
