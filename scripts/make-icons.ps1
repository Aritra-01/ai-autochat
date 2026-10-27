param(
  [string]$OutDir = (Join-Path $PSScriptRoot "..\icons")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$masterSize = 512
$bitmap = New-Object System.Drawing.Bitmap($masterSize, $masterSize)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$outerPath = New-RoundedRectanglePath -X 6 -Y 6 -Width 500 -Height 500 -Radius 112
$gradientRect = New-Object System.Drawing.Rectangle(0, 0, $masterSize, $masterSize)
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $gradientRect,
  [System.Drawing.Color]::FromArgb(255, 15, 23, 42),
  [System.Drawing.Color]::FromArgb(255, 79, 70, 229),
  42.0
)
$graphics.FillPath($gradient, $outerPath)

$innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(42, 255, 255, 255), 5)
$innerPath = New-RoundedRectanglePath -X 13 -Y 13 -Width 486 -Height 486 -Radius 106
$graphics.DrawPath($innerPen, $innerPath)

$bubblePath = New-RoundedRectanglePath -X 92 -Y 104 -Width 328 -Height 238 -Radius 76
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
$graphics.FillPath($whiteBrush, $bubblePath)

$tailPoints = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF(142, 320)),
  (New-Object System.Drawing.PointF(236, 320)),
  (New-Object System.Drawing.PointF(155, 414))
)
$graphics.FillPolygon($whiteBrush, $tailPoints)

$font = New-Object System.Drawing.Font(
  "Segoe UI Symbol",
  166,
  [System.Drawing.FontStyle]::Bold,
  [System.Drawing.GraphicsUnit]::Pixel
)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 67, 56, 202))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$bubbleRect = New-Object System.Drawing.RectangleF(76, 96, 360, 244)
$graphics.DrawString([string][char]0x221E, $font, $textBrush, $bubbleRect, $format)

$sparkleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
$sparkle = New-Object System.Drawing.Drawing2D.GraphicsPath
$sparkle.AddPolygon([System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF(407, 72)),
  (New-Object System.Drawing.PointF(418, 98)),
  (New-Object System.Drawing.PointF(444, 109)),
  (New-Object System.Drawing.PointF(418, 120)),
  (New-Object System.Drawing.PointF(407, 146)),
  (New-Object System.Drawing.PointF(396, 120)),
  (New-Object System.Drawing.PointF(370, 109)),
  (New-Object System.Drawing.PointF(396, 98))
))
$graphics.FillPath($sparkleBrush, $sparkle)

foreach ($size in @(16, 32, 48, 128)) {
  $resized = New-Object System.Drawing.Bitmap($size, $size)
  $resizeGraphics = [System.Drawing.Graphics]::FromImage($resized)
  $resizeGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizeGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $resizeGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $resizeGraphics.Clear([System.Drawing.Color]::Transparent)
  $resizeGraphics.DrawImage($bitmap, 0, 0, $size, $size)

  $target = Join-Path $OutDir ("icon{0}.png" -f $size)
  $resized.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)

  $resizeGraphics.Dispose()
  $resized.Dispose()
}

$font.Dispose()
$format.Dispose()
$textBrush.Dispose()
$whiteBrush.Dispose()
$innerPen.Dispose()
$gradient.Dispose()
$sparkleBrush.Dispose()
$sparkle.Dispose()
$bubblePath.Dispose()
$outerPath.Dispose()
$innerPath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Created icons in $OutDir"
Get-ChildItem $OutDir -Filter "icon*.png" | Select-Object Name, Length
