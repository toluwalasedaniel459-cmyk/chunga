# Generates the synthetic test voice notes in data/audio from data/audio/clips.json,
# fully offline, using the speech voices built into Windows.
# Run:  npm run make-audio
# Output: 16 kHz mono 16-bit WAV (the format Whisper uses internally).

Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$audioDir = Join-Path $root 'data\audio'
$clips = (Get-Content (Join-Path $audioDir 'clips.json') -Raw -Encoding UTF8 | ConvertFrom-Json).clips

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($clip in $clips) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try { $synth.SelectVoice($clip.voice) } catch { Write-Host "Voice '$($clip.voice)' not found, using default" }
  $synth.Rate = -1   # slightly slower, like a real phone call
  $out = Join-Path $audioDir $clip.file
  $synth.SetOutputToWaveFile($out, $format)
  $synth.Speak($clip.script)
  $synth.Dispose()
  Write-Host "Created $($clip.file)"
}
