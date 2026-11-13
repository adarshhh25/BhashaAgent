Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root 'public\icons\Logo.png'

if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found at $srcPath"
    exit 1
}

$srcImage = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Host "Source image loaded: $($srcImage.Width) x $($srcImage.Height)"

# Exact content bounds calculated from pixel alpha:
# minX = 199, minY = 205, maxX = 1050, maxY = 1050
# contentWidth = 852, contentHeight = 846, maxDim = 852
# Center = (624.5, 627.5)
$centerX = 624.5
$centerY = 627.5
$contentMaxDim = 852.0

# Previous baseline: 92.0% occupancy (~926 px crop).
# Fine-tune adjustment: +6.0% artwork size increase (5-8% range)
# New occupancy: 92.0% * 1.060 = 97.5% occupancy (leaving ~1.25% safe margin on each side)
$previousOccupancy = 0.920
$increasePercent = 0.060 # +6%
$occupancy = $previousOccupancy * (1.0 + $increasePercent) # 0.9752

$cropSize = [float]($contentMaxDim / $occupancy) # ~873.67 px
$cropX = [float]($centerX - ($cropSize / 2.0))
$cropY = [float]($centerY - ($cropSize / 2.0))

Write-Host "Fine-tuned crop region: X=$cropX, Y=$cropY, Width=$cropSize, Height=$cropSize"
Write-Host "Artwork canvas occupancy: $([math]::Round($occupancy * 100, 1))% (+6.0% larger than previous baseline)"

$sizes = @(16, 32, 48, 128)
$iconsDir = Split-Path $srcPath

foreach ($size in $sizes) {
    $destBitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    
    $destRect = New-Object System.Drawing.RectangleF(0.0, 0.0, [float]$size, [float]$size)
    $graphics.DrawImage($srcImage, $destRect, (New-Object System.Drawing.RectangleF($cropX, $cropY, $cropSize, $cropSize)), [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()
    
    $destPath = Join-Path $iconsDir ("icon$size.png")
    $destBitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBitmap.Dispose()
    
    $fileInfo = Get-Item $destPath
    Write-Host "Generated fine-tuned icon: $destPath ($($fileInfo.Length) bytes, ${size}x${size})"
}

$srcImage.Dispose()
Write-Host "All Chrome extension icons successfully fine-tuned (+6.0% larger)!"
