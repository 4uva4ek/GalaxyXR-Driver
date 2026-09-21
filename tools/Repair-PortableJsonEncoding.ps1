param(
    [Parameter(Mandatory=$true)]
    [string]$PackageDirectory
)

$ErrorActionPreference = 'Stop'
$package = [IO.Path]::GetFullPath($PackageDirectory)
$utf8NoBom = [Text.UTF8Encoding]::new($false)

$files = @(
    (Join-Path $package 'driver.vrdrivermanifest'),
    (Join-Path $package 'resources/settings/default.vrsettings')
)

foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Required package JSON file not found: $file"
    }

    # ReadAllText consumes an existing UTF-8 BOM. Writing with UTF8Encoding(false)
    # preserves the JSON text while removing that BOM.
    $text = [IO.File]::ReadAllText($file)
    [IO.File]::WriteAllText($file, $text, $utf8NoBom)

    $bytes = [IO.File]::ReadAllBytes($file)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        throw "Failed to remove UTF-8 BOM: $file"
    }
    Write-Output "Repaired UTF-8 encoding: $file"
}

Write-Output 'Portable SteamVR JSON files are UTF-8 without BOM.'
