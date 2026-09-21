# Windows PowerShell 5.1 / PowerShell 7 bridge. No remote script execution.
# Dot-source for the Node bootstrap; otherwise use the small operation interface.
param(
    [ValidateSet('Download','ExtractZip')][string]$Operation,
    [string]$Source, [string]$Destination, [string]$Sha256, [string]$Prefix = ''
)

function Assert-ToolDownloadUri {
    param([Parameter(Mandatory=$true)][string]$Value)
    $uri = [Uri]$Value
    $hosts = @('aka.ms', 'download.visualstudio.microsoft.com', 'download.microsoft.com',
        'nodejs.org', 'static.rust-lang.org')
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or
        $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Fragment -or
        $hosts -notcontains $uri.DnsSafeHost.ToLowerInvariant()) {
        throw "Refusing non-official or non-HTTPS tool download: $Value"
    }
    if ($uri.DnsSafeHost -eq 'aka.ms' -and $uri.AbsolutePath -ne '/vs/17/release/channel') {
        throw 'Only the Visual Studio 2022 release-channel URL is allowed on aka.ms.'
    }
    return $uri
}

function Invoke-ToolDownload {
    param([Parameter(Mandatory=$true)][string]$Source,
          [Parameter(Mandatory=$true)][string]$Destination, [string]$Sha256)
    $initialUri = Assert-ToolDownloadUri $Source
    if ($Sha256 -and $Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid SHA-256 value.' }
    if ($Sha256 -and (Test-Path -LiteralPath $Destination -PathType Leaf) -and
        (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Sha256) { return }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Destination))) | Out-Null
    $partial = $Destination + '.part'
    $previousProtocol = [Net.ServicePointManager]::SecurityProtocol
    try {
        [Net.ServicePointManager]::SecurityProtocol = $previousProtocol -bor [Net.SecurityProtocolType]::Tls12
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $uri = $initialUri
                for ($redirect = 0; $redirect -le 8; $redirect++) {
                    $request = [Net.HttpWebRequest]::Create($uri)
                    $request.AllowAutoRedirect = $false
                    $request.Timeout = 90000
                    $request.ReadWriteTimeout = 90000
                    $request.UserAgent = 'GalaxyXRDriver-PortableBuild/1.2.0'
                    if ($request.Proxy) { $request.Proxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials }
                    $response = $null
                    try {
                        $response = $request.GetResponse()
                        $code = [int]$response.StatusCode
                        if ($code -ge 300 -and $code -le 399) {
                            if ($redirect -eq 8 -or -not $response.Headers['Location']) { throw 'Invalid or excessive HTTP redirects.' }
                            $uri = Assert-ToolDownloadUri ([Uri]::new($uri, $response.Headers['Location']).AbsoluteUri)
                            continue
                        }
                        if ($code -ne 200) { throw "HTTP $code when downloading $Source" }
                        $inputStream = $response.GetResponseStream()
                        $outputStream = [IO.File]::Create($partial)
                        try { $inputStream.CopyTo($outputStream) }
                        finally { $outputStream.Dispose(); $inputStream.Dispose() }
                        if ($response.ContentLength -ge 0 -and (Get-Item -LiteralPath $partial).Length -ne $response.ContentLength) {
                            throw 'Download ended before the advertised content length.'
                        }
                        break
                    } finally { if ($response) { $response.Dispose() } }
                }
                if ($Sha256 -and (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $Sha256) {
                    throw "SHA-256 mismatch: $Source. No files from this download were executed or extracted."
                }
                Move-Item -LiteralPath $partial -Destination $Destination -Force
                return
            } catch {
                if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
                if ($attempt -eq 3) { throw "Download failed after $attempt attempts: $Source`n$($_.Exception.Message)" }
                Write-Host "[tools] Download attempt $attempt failed; retrying..."
                Start-Sleep -Seconds (2 * $attempt)
            }
        }
    } finally { [Net.ServicePointManager]::SecurityProtocol = $previousProtocol }
}

function Expand-ToolZip {
    param([Parameter(Mandatory=$true)][string]$Source,
          [Parameter(Mandatory=$true)][string]$Destination, [string]$Prefix = '')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $root = [IO.Path]::GetFullPath($Destination).TrimEnd('\','/')
    [IO.Directory]::CreateDirectory($root) | Out-Null
    $archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Source))
    try {
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\','/')
            if ($Prefix -and -not $name.StartsWith($Prefix, [StringComparison]::Ordinal)) { continue }
            if ($Prefix) { $name = $name.Substring($Prefix.Length) }
            if (-not $name) { continue }
            if ($name.StartsWith('/') -or $name.Contains(':') -or $name.Split('/') -contains '..') {
                throw "Unsafe archive entry: $($entry.FullName)"
            }
            $target = [IO.Path]::GetFullPath((Join-Path $root $name))
            if (-not $target.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                throw "Archive entry escapes tool directory: $name"
            }
            # Never follow a pre-existing directory junction/symlink during extraction.
            $parent = [IO.Path]::GetDirectoryName($target)
            $cursor = $parent
            while ($cursor -and $cursor.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
                if (Test-Path -LiteralPath $cursor) {
                    if (((Get-Item -Force -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                        throw "Refusing to extract through a reparse point: $cursor"
                    }
                }
                $cursor = [IO.Path]::GetDirectoryName($cursor)
            }
            if (Test-Path -LiteralPath $target) {
                if (((Get-Item -Force -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                    throw "Refusing to overwrite a reparse point: $target"
                }
            }
            if ($name.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
            [IO.Directory]::CreateDirectory($parent) | Out-Null
            $inputStream = $entry.Open()
            $outputStream = [IO.File]::Create($target)
            try { $inputStream.CopyTo($outputStream) }
            finally { $outputStream.Dispose(); $inputStream.Dispose() }
        }
    } finally { $archive.Dispose() }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try {
        switch ($Operation) {
            'Download' { Invoke-ToolDownload -Source $Source -Destination $Destination -Sha256 $Sha256 }
            'ExtractZip' { Expand-ToolZip -Source $Source -Destination $Destination -Prefix $Prefix }
            default { throw 'Specify -Operation Download or ExtractZip.' }
        }
    } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
}
