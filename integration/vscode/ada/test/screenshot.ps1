
param(
    [Parameter(Mandatory = $false)]
    [switch]$Help,
    [Parameter(Mandatory = $false)]
    [string]$OutputPath
)


if ($Help -or !$OutputPath) {
    Write-Host "Usage: .\screenshot.ps1 -OutputPath <path> [-Help]"
    Write-Host "  -OutputPath <path>   Path to save the screenshot (required; can be relative or absolute)"
    Write-Host "  -Help                Show this help message"
    exit
}

# Resolve relative path to absolute path
if (!(Split-Path $OutputPath -IsAbsolute)) {
    $OutputPath = Join-Path (Get-Location) $OutputPath
}

[Reflection.Assembly]::LoadWithPartialName("System.Drawing") | Out-Null
[Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null

# Get the bounds of the primary screen
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

$bmp = New-Object Drawing.Bitmap $bounds.width, $bounds.height
$graphics = [Drawing.Graphics]::FromImage($bmp)
try {
    $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.size)
    $bmp.Save($OutputPath)
}
catch {
    Write-Error "Screenshot failed: $_"
}
finally {
    $graphics.Dispose()
    $bmp.Dispose()
}
