# chunga-executa

An [Anna Executa](https://staging.anna.partners/developers/tools/executa-nodejs) plugin
for **Chunga**, the offline mobile-money scam checker.

- **One tool:** `check_message(message, language?)`, where `language` is `en`, `sw` or `pcm`.
- **Returns** `verdict` (SCAM / SUSPICIOUS / SAFE), `confidence` (0–100),
  `red_flags`, `explanation` and `advice`, plus `label`, `language`,
  `decided_by`, `ai_used` and `red_flag_details` (each flag with its source:
  `rule` or `ai`).
- **On failure** it returns `{ "success": false, "error": "…" }`.
- **Protocol:** Executa 1.1 (JSON-RPC 2.0 over stdio). The process is long-running and exits on stdin EOF or SIGTERM.

## How it works

1. **Rules** (12 red-flag patterns, English / Swahili / Sheng) answer instantly.
2. **A local QVAC LLM** (Llama 3.2 1B, `@qvac/sdk` 0.22.0) double-checks once
   it is loaded. It runs in a separate helper process (`ai-worker.js`) whose
   stdout is redirected to stderr, so nothing QVAC prints can reach the
   protocol stream. If QVAC fails or crashes, the plugin keeps answering
   with the rules.
3. `combine.js` merges them. A strong rule hit is always SCAM, and the AI alone can
   say at most SUSPICIOUS.

No cloud AI is used, and the message never leaves the machine. The first start
downloads the model (~773 MB) into `~/.qvac/models`; after that it works offline.
Until the model has loaded, checks are answered by the rules alone.

## Settings (environment variables)

| Variable | Default | Effect |
|---|---|---|
| `CHUNGA_AI` | on | `off` = rules only, never start the AI |
| `CHUNGA_AI_BUDGET_MS` | `150000` | Max time to wait for the AI per check; after that it is cancelled and the rules answer |

## Develop

```bash
npm run build     # copy the shared code from ../src into lib/
npm test          # smoke test, rules only
npm test -- --ai  # also load the local AI and check with it
```

Source: https://github.com/toluwalasedaniel459-cmyk/chunga
