$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$size = 512
$outputPath = Join-Path (Split-Path -Parent $PSScriptRoot) "build\icon.png"
$bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRectanglePath {
  param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
  $diameter = $Radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$shape = New-RoundedRectanglePath -X 28 -Y 28 -Width 456 -Height 456 -Radius 92
$background = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#17201c"))
$border = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#64716b"), 12)
$graphics.FillPath($background, $shape)
$graphics.DrawPath($border, $shape)

$accent = [System.Drawing.ColorTranslator]::FromHtml("#55d39a")
$softAccent = [System.Drawing.Color]::FromArgb(46, $accent)
$softPen = New-Object System.Drawing.Pen($softAccent, 8)
$graphics.DrawLine($softPen, 160, 158, 352, 346)
$dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, $accent))
$graphics.FillEllipse($dotBrush, 135, 141, 26, 26)
$graphics.FillEllipse($dotBrush, 351, 345, 26, 26)

$font = New-Object System.Drawing.Font("Georgia", 176, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#b8f0d5"))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString("SB", $font, $textBrush, (New-Object System.Drawing.RectangleF(0, 4, $size, $size)), $format)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$format.Dispose()
$textBrush.Dispose()
$font.Dispose()
$dotBrush.Dispose()
$softPen.Dispose()
$border.Dispose()
$background.Dispose()
$shape.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Generated $outputPath"
