# Draws the synthetic test screenshots in data/images from data/images/images.json,
# fully offline, using Windows' built-in System.Drawing. They look like a phone's
# messages app: a header with the sender, then grey message bubbles.
# Run: npm run make-images

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$imgDir = Join-Path $root 'data\images'
$items = (Get-Content (Join-Path $imgDir 'images.json') -Raw -Encoding UTF8 | ConvertFrom-Json).images

$W = 720; $H = 1280; $pad = 32; $bubbleW = 560
$headerFont = New-Object System.Drawing.Font('Segoe UI', 26, [System.Drawing.FontStyle]::Bold)
$textFont = New-Object System.Drawing.Font('Segoe UI', 22)
$smallFont = New-Object System.Drawing.Font('Segoe UI', 16)
$ink = [System.Drawing.Brushes]::Black
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, 110, 110))
$bubble = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(233, 233, 235))
$header = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(246, 246, 248))

foreach ($item in $items) {
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'ClearTypeGridFit'
  $g.Clear([System.Drawing.Color]::White)

  # Status bar + header with the sender
  $g.DrawString('10:42', $smallFont, $ink, $pad, 14)
  $g.FillRectangle($header, 0, 56, $W, 110)
  $g.DrawString($item.sender, $headerFont, $ink, $pad, 86)

  # Message bubbles
  $y = 200
  $g.DrawString('Today', $smallFont, $muted, ($W / 2) - 28, $y); $y += 50
  foreach ($text in $item.bubbles) {
    $size = $g.MeasureString($text, $textFont, $bubbleW - 2 * 24)
    $rect = New-Object System.Drawing.RectangleF($pad, $y, ($size.Width + 48), ($size.Height + 36))
    $g.FillRectangle($bubble, $rect)
    $g.DrawString($text, $textFont, $ink, (New-Object System.Drawing.RectangleF(($pad + 24), ($y + 18), ($bubbleW - 48), ($size.Height + 4))))
    $y += $rect.Height + 28
  }

  $out = Join-Path $imgDir $item.file
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "Created $($item.file)"
}
