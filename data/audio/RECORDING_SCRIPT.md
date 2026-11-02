# Recording script for real test voice notes

The clips in this folder were made with the built-in **English** Windows voices
(`npm run make-audio`). They are clean and easy, and they can't test real
Swahili or Sheng speech. Please record real versions with your phone.

## How to record

1. Use WhatsApp (send a voice note to yourself) or your phone's voice recorder.
2. Speak naturally, like a real phone call. A little background noise is good.
3. Save each file into this folder with the **file name shown below**.
   `.ogg`, `.opus`, `.m4a`, `.mp3` and `.wav` all work. If the extension differs,
   update `"file"` for that clip in `clips.json`.
4. Copy the words you actually said into `"script"` in `clips.json`
   (needed for the word-error-rate score).
5. Run: `$env:CHUNGA_AUDIO="on"; npm run eval -- --audio`

Use only made-up names and numbers. Never record a real person's number.

## Clips

### 1. `audio-scam-agent` – fake Safaricom agent (SCAM)
**Swahili/Sheng:**
> Habari mteja, naitwa Peter kutoka huduma kwa wateja wa Safaricom. Laini yako ya M-PESA itafungwa leo kwa sababu ya usajili. Tafadhali niambie ile code tumekutumia sasa hivi ndio tuthibitishe akaunti yako.

### 2. `audio-scam-reversal` – fake reversal (SCAM)
**Sheng:**
> Niaje boss, pole kukusumbua. Nimekutumia doh, elfu tatu mia tano, kimakosa. Ilikuwa ya hospitali ya mathe. Tafadhali nirudishie haraka, ni emergency.

### 3. `audio-scam-loan` – fake loan offer (SCAM)
**English with Swahili:**
> Hongera! You have qualified for an instant loan of twenty thousand shillings, bila guarantor. To activate your loan today, pay a registration fee of three hundred shillings.

### 4. `audio-safe-family` – normal family message (SAFE)
**Swahili:**
> Mum, nimefika salama Nakuru. Safari ilikuwa poa. Nitakupigia jioni nikimaliza kazi. Usijali.

### 5. `audio-safe-work` – normal work message (SAFE)
**English:**
> Hi Wanjiku, the staff meeting has moved to Thursday at ten in the morning. Please bring the October sales report. Thank you.
