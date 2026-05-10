#requires -PSEdition Desktop
# Generates PWA icons for Common House portal.
# Output: public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png + public/favicon.ico-style PNGs.
# Run from repo root:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repoRoot "public/icons"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Hall tokens
$inkHex   = "#0E0E10"   # --hall-ink-0
$paperHex = "#FAFAF7"   # --hall-paper-0 (warm off-white)
$ink   = [System.Drawing.ColorTranslator]::FromHtml($inkHex)
$paper = [System.Drawing.ColorTranslator]::FromHtml($paperHex)

function New-Icon {
  param(
    [int]$Size,
    [System.Drawing.Color]$Bg,
    [System.Drawing.Color]$Fg,
    [string]$Text = "CH",
    [double]$SafeArea = 1.0,   # 1.0 = no padding (full bleed). 0.8 = 10% margin each side (maskable safe zone)
    [string]$OutPath
  )
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $gfx.Clear($Bg)

  # Font sized to safe area. SafeArea=1.0 -> ~52% of canvas height. Maskable (0.8) -> ~42% of canvas.
  $fontPx = [int]([Math]::Round($Size * 0.52 * $SafeArea))
  $font = New-Object System.Drawing.Font("Arial", $fontPx, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush($Fg)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $gfx.DrawString($Text, $font, $brush, $rect, $format)

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose(); $font.Dispose(); $gfx.Dispose(); $bmp.Dispose()
  Write-Output "wrote $OutPath ($Size x $Size)"
}

# Standard "any" purpose icons (full-bleed CH on ink-0 bg)
New-Icon -Size 192 -Bg $ink -Fg $paper -SafeArea 1.0 -OutPath (Join-Path $outDir "icon-192.png")
New-Icon -Size 512 -Bg $ink -Fg $paper -SafeArea 1.0 -OutPath (Join-Path $outDir "icon-512.png")

# Maskable purpose (inside 80% safe zone — outer 20% may be clipped to circle/squircle)
New-Icon -Size 512 -Bg $ink -Fg $paper -SafeArea 0.8 -OutPath (Join-Path $outDir "icon-maskable-512.png")

# Apple touch icon (180px, paper bg + ink fg per iOS convention)
New-Icon -Size 180 -Bg $paper -Fg $ink -SafeArea 0.85 -OutPath (Join-Path $outDir "apple-touch-icon.png")

# Favicon-style
New-Icon -Size 32 -Bg $ink -Fg $paper -SafeArea 1.0 -OutPath (Join-Path $outDir "favicon-32.png")
New-Icon -Size 16 -Bg $ink -Fg $paper -SafeArea 1.0 -OutPath (Join-Path $outDir "favicon-16.png")

Write-Output ""
Write-Output "Icons generated. Re-run this script if --hall-ink-0 / --hall-paper-0 tokens change."
