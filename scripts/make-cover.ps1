# Draws the 1200x630 cover image (docs/cover.png) offline with System.Drawing.
# Colours match public/styles.css. Run: npm run make-cover

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'docs'
New-Item -ItemType Directory -Force $outDir | Out-Null
$W = 1200; $H = 630
$dot = [string][char]0x00B7   # middle dot, written as a code so the file stays ASCII

function Color($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function Brush($hex) { New-Object System.Drawing.SolidBrush (Color $hex) }
function Font($size, $style = 'Regular') { New-Object System.Drawing.Font('Segoe UI', $size, [System.Drawing.FontStyle]::$style, [System.Drawing.GraphicsUnit]::Pixel) }
function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); return $p
}

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.InterpolationMode = 'HighQualityBicubic'

# Background: deep green with a soft diagonal glow
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point($W, $H)), (Color '#083f28'), (Color '#0f7a4d'))
$g.FillRectangle($bg, 0, 0, $W, $H)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 255, 255, 255))), 700, -160, 640, 640)

# ---- Left: headline ---------------------------------------------------------
$white = Brush '#ffffff'
$soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 255, 255, 255))
# Logo mark + name
$g.FillPath((Brush '#ffffff'), (RoundRect 72 70 56 56 14))
$g.DrawString('!', (Font 40 'Bold'), (Brush '#0b5d3b'), 87, 70)
$g.DrawString('Chunga', (Font 34 'Bold'), $white, 140, 76)

$g.DrawString('Is this message', (Font 64 'Bold'), $white, 66, 168)
$g.DrawString('a scam?', (Font 64 'Bold'), $white, 66, 248)
$g.DrawString('Ask Chunga.', (Font 64 'Bold'), (Brush '#ffd166'), 66, 328)

$g.DrawString('Checks SMS, WhatsApp, voice notes and screenshots', (Font 24), $soft, 72, 440)
$g.DrawString('for mobile-money scams, in English or Swahili.', (Font 24), $soft, 72, 474)

# Offline pill
$g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 255, 255, 255))), (RoundRect 72 536 470 48 24))
$g.FillEllipse((Brush '#5fd38a'), 92, 553, 14, 14)
$g.DrawString("100% offline $dot AI runs on your device with QVAC", (Font 20 'Bold'), $white, 116, 546)

# ---- Right: phone with a SCAM verdict ---------------------------------------
$px = 790; $py = 34; $pw = 330; $ph = 562
$g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 0, 0))), (RoundRect ($px + 10) ($py + 14) $pw $ph 46))   # shadow
$g.FillPath((Brush '#111418'), (RoundRect $px $py $pw $ph 46))                                                                                     # phone body
$sx = $px + 14; $sy = $py + 14; $sw = $pw - 28
$g.FillPath((Brush '#ffffff'), (RoundRect $sx $sy $sw ($ph - 28) 34))                                                                              # screen
$g.FillPath((Brush '#111418'), (RoundRect ($px + $pw / 2 - 45) ($sy + 8) 90 22 11))                                                                # notch

$ink = Brush '#111418'; $muted = Brush '#4a5159'
# App header
$g.FillPath((Brush '#0b5d3b'), (RoundRect ($sx + 18) ($sy + 46) 30 30 8))
$g.DrawString('!', (Font 21 'Bold'), $white, ($sx + 26), ($sy + 46))
$g.DrawString('Chunga', (Font 20 'Bold'), $ink, ($sx + 56), ($sy + 48))

# The pasted message
$bubble = New-Object System.Drawing.RectangleF(($sx + 18), ($sy + 94), ($sw - 36), 92)
$g.FillPath((Brush '#e9eaec'), (RoundRect $bubble.X $bubble.Y $bubble.Width $bubble.Height 14))
$g.DrawString('"I have sent you Ksh 3,500 by mistake. Please send it back to 07XX XXX 214."', (Font 15), $ink, (New-Object System.Drawing.RectangleF(($bubble.X + 12), ($bubble.Y + 10), ($bubble.Width - 24), ($bubble.Height - 16))))

# Verdict card
$cy = $sy + 202
$g.FillPath((Brush '#fde7ea'), (RoundRect ($sx + 18) $cy ($sw - 36) 96 16))
$g.DrawPath((New-Object System.Drawing.Pen((Color '#b3001b'), 4)), (RoundRect ($sx + 18) $cy ($sw - 36) 96 16))
$g.FillEllipse((Brush '#b3001b'), ($sx + 34), ($cy + 22), 52, 52)
$xPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 6)
$xPen.StartCap = 'Round'; $xPen.EndCap = 'Round'
$g.DrawLine($xPen, ($sx + 49), ($cy + 37), ($sx + 71), ($cy + 59))
$g.DrawLine($xPen, ($sx + 71), ($cy + 37), ($sx + 49), ($cy + 59))
$g.DrawString('SCAM', (Font 36 'Bold'), (Brush '#b3001b'), ($sx + 96), ($cy + 14))
$g.DrawString('Confidence: 97%', (Font 15 'Bold'), $ink, ($sx + 99), ($cy + 60))

# Reasons
$ry = $cy + 116
$g.DrawString('Why', (Font 17 'Bold'), $ink, ($sx + 18), $ry)
$reasons = @('Asks you to send money "back"', 'Personal phone number, not M-PESA')
$i = 0
foreach ($r in $reasons) {
  $y = $ry + 30 + $i * 28
  $g.FillEllipse((Brush '#b3001b'), ($sx + 22), ($y + 8), 8, 8)
  $g.DrawString($r, (Font 15), $ink, ($sx + 38), $y)
  $i++
}

# Advice
$ay = $ry + 104
$g.DrawString('What to do', (Font 17 'Bold'), $ink, ($sx + 18), $ay)
$advice = @("Don't reply or call back", "Don't send money", 'Check your balance yourself')
$i = 0
foreach ($a in $advice) {
  $y = $ay + 30 + $i * 28
  $g.DrawString("$($i + 1).", (Font 15 'Bold'), $muted, ($sx + 20), $y)
  $g.DrawString($a, (Font 15), $ink, ($sx + 42), $y)
  $i++
}

# Language toggle hint
$g.FillPath((Brush '#0b5d3b'), (RoundRect ($sx + $sw - 98) ($sy + 46) 80 30 15))
$g.DrawString("EN $dot SW", (Font 14 'Bold'), $white, ($sx + $sw - 89), ($sy + 51))

$out = Join-Path $outDir 'cover.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "Created docs/cover.png ($W x $H)"
