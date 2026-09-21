# Prepare build-only dependencies. Does not deploy a driver or edit SteamVR.
[CmdletBinding()]
param(
    [switch]$DriverOnly, [switch]$GuiOnly, [switch]$NoDownload,
    [switch]$AcceptToolchainLicense, [switch]$PrepareDependencies
)
$ErrorActionPreference = 'Stop'
if ($DriverOnly -and $GuiOnly) { throw 'Choose at most one partial-build switch.' }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
    -not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess) {
    throw 'Run the portable build in 64-bit Windows PowerShell 5.1 or PowerShell 7.'
}
$repo = Split-Path $PSScriptRoot -Parent
$toolRoot = Join-Path $repo 'build/toolchains'
foreach ($required in @('build.js', 'GalaxyXRDriver/GalaxyXRDriver.vcxproj', 'GalaxyXRDriverGUI/package-lock.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repo $required) -PathType Leaf)) {
        throw "Missing project source: $required. Apply the update at the project root."
    }
}
# Refuse redirection through junctions before writing a tool cache.
$cursor = [IO.Path]::GetFullPath($toolRoot)
while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
        if (((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Portable tool directory uses a junction/symlink: $cursor"
        }
    }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
}
[IO.Directory]::CreateDirectory($toolRoot) | Out-Null
try {
    $bootstrapLock = [IO.File]::Open((Join-Path $toolRoot '.bootstrap.lock'),
        [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch { throw 'Another portable dependency setup is already using this checkout. Wait for it to finish.' }
try {
. (Join-Path $PSScriptRoot 'PortableToolchainIO.ps1')

function Test-SupportedBuildNode {
    param([string]$Executable)
    if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    # Probe failures must not be mistaken for an available installation.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $description = & $Executable -p 'process.versions.node.concat(String.fromCharCode(58),process.arch)' 2>$null
        if ($LASTEXITCODE -ne 0 -or $description -notmatch '^(\d+)\.(\d+)\.(\d+):x64$') { return $false }
        $major = [int]$Matches[1]; $minor = [int]$Matches[2]
        # Vite's supported Node 22 baseline; prefer maintained even-numbered majors.
        return ($major -eq 22 -and $minor -ge 12) -or ($major -ge 24 -and $major % 2 -eq 0)
    } catch { return $false } finally { $ErrorActionPreference = $previousEap }
}

$portableNode = Join-Path $toolRoot 'node/node.exe'
$node = $null
if ((Test-SupportedBuildNode $portableNode) -and
    (Test-Path -LiteralPath (Join-Path $toolRoot 'node/npm.cmd'))) { $node = $portableNode }
if (-not $node) {
    $installedNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($installedNode -and (Test-SupportedBuildNode $installedNode.Source) -and
        (Test-Path -LiteralPath (Join-Path (Split-Path $installedNode.Source -Parent) 'npm.cmd'))) {
        $node = $installedNode.Source
    }
}
if (-not $node) {
    if ($NoDownload) { throw 'A supported x64 Node.js with npm is missing. Run without -NoDownload to download a project-local Node 22 runtime.' }
    $cache = Join-Path $toolRoot 'downloads'
    New-Item -ItemType Directory -Force -Path $cache | Out-Null
    # Resolve a supported release once, then fetch its immutable versioned ZIP.
    # No Python, Git, package manager, or global Node installation is required.
    $checksums = Join-Path $cache 'node22-SHASUMS256.txt'
    Invoke-ToolDownload -Source 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -Destination $checksums
    $entry = [regex]::Match([IO.File]::ReadAllText($checksums), '(?m)^([a-fA-F0-9]{64})\s+\*?(node-(v22\.\d+\.\d+)-win-x64\.zip)\r?$')
    if (-not $entry.Success) { throw 'The official Node 22 checksum list did not contain an x64 Windows ZIP.' }
    $digest = $entry.Groups[1].Value; $filename = $entry.Groups[2].Value; $version = $entry.Groups[3].Value
    Write-Host "[tools] Downloading portable Node.js $version with npm ..."
    $archive = Join-Path $cache $filename
    Invoke-ToolDownload -Source "https://nodejs.org/dist/$version/$filename" -Destination $archive -Sha256 $digest
    $stage = Join-Path $toolRoot ('.node-new-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
    Expand-ToolZip -Source $archive -Destination $stage
    $extracted = Join-Path $stage ([IO.Path]::GetFileNameWithoutExtension($filename))
    if (-not (Test-SupportedBuildNode (Join-Path $extracted 'node.exe')) -or
        -not (Test-Path -LiteralPath (Join-Path $extracted 'npm.cmd'))) {
        throw "The verified Node archive did not provide a supported runtime: $stage"
    }
    $nodeRoot = Join-Path $toolRoot 'node'
    # Do not overwrite a user's damaged/old cache without keeping a recovery copy.
    if (Test-Path -LiteralPath $nodeRoot) {
        $backup = $nodeRoot + '.previous-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
        Move-Item -LiteralPath $nodeRoot -Destination $backup
        Write-Host "[tools] Previous Node cache retained at $backup"
    }
    Move-Item -LiteralPath $extracted -Destination $nodeRoot
    Remove-Item -LiteralPath $stage -Force
    $node = Join-Path $nodeRoot 'node.exe'
}
if (-not (Test-Path -LiteralPath (Join-Path (Split-Path $node -Parent) 'npm.cmd'))) {
    throw "Node exists but its npm.cmd is missing: $node. Restore Node/npm or remove the incomplete portable node folder and retry."
}
$hostExecutable = if ($PSVersionTable.PSEdition -eq 'Core') { Join-Path $PSHOME 'pwsh.exe' } else { Join-Path $PSHOME 'powershell.exe' }
$setupArguments = @((Join-Path $PSScriptRoot 'lib/portable-toolchain.cjs'), '--project', $repo, '--powershell', $hostExecutable)
if ($DriverOnly) { $setupArguments += '--driver-only' }
if ($GuiOnly) { $setupArguments += '--gui-only' }
if ($NoDownload) { $setupArguments += '--no-download' }
if ($AcceptToolchainLicense) { $setupArguments += '--accept-license' }
if ($PrepareDependencies) { $setupArguments += '--prepare-dependencies' }
& $node @setupArguments
if ($LASTEXITCODE -ne 0) { throw "Portable dependency setup failed. See the message above and $toolRoot/logs. The build has not started." }

} finally { $bootstrapLock.Dispose() }
