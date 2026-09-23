Add-Type -AssemblyName System.Drawing

$iconDirectory = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null

function New-MagicIcon([int]$size, [string]$name, [bool]$maskable) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $purple = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(56, 38, 94))
    $gold = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 205, 119))
    $margin = if ($maskable) { 0 } else { [int]($size * 0.03) }
    $radius = if ($maskable) { 0 } else { [int]($size * 0.21) }
    $bounds = [System.Drawing.Rectangle]::new($margin, $margin, $size - 2 * $margin, $size - 2 * $margin)
    $background = [System.Drawing.Drawing2D.GraphicsPath]::new()
    if ($radius -eq 0) {
        $background.AddRectangle($bounds)
    } else {
        $diameter = 2 * $radius
        $background.AddArc($bounds.Left, $bounds.Top, $diameter, $diameter, 180, 90)
        $background.AddArc($bounds.Right - $diameter, $bounds.Top, $diameter, $diameter, 270, 90)
        $background.AddArc($bounds.Right - $diameter, $bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
        $background.AddArc($bounds.Left, $bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
        $background.CloseFigure()
    }
    $graphics.FillPath($purple, $background)

    $center = $size / 2.0
    $outer = $size * $(if ($maskable) { 0.30 } else { 0.39 })
    $inner = $size * $(if ($maskable) { 0.087 } else { 0.115 })
    $points = @(
        [System.Drawing.PointF]::new($center, $center - $outer),
        [System.Drawing.PointF]::new($center + $inner, $center - $inner),
        [System.Drawing.PointF]::new($center + $outer, $center),
        [System.Drawing.PointF]::new($center + $inner, $center + $inner),
        [System.Drawing.PointF]::new($center, $center + $outer),
        [System.Drawing.PointF]::new($center - $inner, $center + $inner),
        [System.Drawing.PointF]::new($center - $outer, $center),
        [System.Drawing.PointF]::new($center - $inner, $center - $inner)
    )
    $graphics.FillPolygon($gold, [System.Drawing.PointF[]]$points)

    $bitmap.Save((Join-Path $iconDirectory $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $background.Dispose()
    $gold.Dispose()
    $purple.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

New-MagicIcon 192 'icon-192.png' $false
New-MagicIcon 512 'icon-512.png' $false
New-MagicIcon 512 'icon-maskable-512.png' $true
New-MagicIcon 180 'apple-touch-icon.png' $false
