# Windows PowerShell 5.1 / PowerShell 7 bridge. No remote script execution.
# Dot-source for the Node bootstrap; otherwise use the small operation interface.
# CacheOnly is deliberately distinct from the caller's local-build NoDownload flag.
param(
    [ValidateSet('Download','ExtractZip')][string]$Operation,
    [string]$Source, [string]$Destination, [string]$Sha256, [string]$Prefix = '',
    [long]$ExpectedSize = -1, [string]$LogFile, [switch]$CacheOnly
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
    if ($uri.DnsSafeHost -eq 'aka.ms' -and
        @('/vs/17/release/channel','/vs/17/release/vs_buildtools.exe') -notcontains $uri.AbsolutePath.ToLowerInvariant()) {
        throw 'Only the Visual Studio 2022 release channel and Build Tools bootstrapper URLs are allowed on aka.ms.'
    }
    return $uri
}

function New-ToolDownloadRequest {
    param([Parameter(Mandatory=$true)][Uri]$Uri)
    # Decode HTTP transport compression before comparing the publisher's file
    # checksum. Never decode/re-serialize JSON or normalize its line endings.
    $request = [Net.HttpWebRequest]::Create((Assert-ToolDownloadUri $Uri.AbsoluteUri))
    $request.AllowAutoRedirect = $false
    $request.Timeout = 90000
    $request.ReadWriteTimeout = 90000
    $request.UserAgent = 'GalaxyXRDriver-PortableBuild/1.2.0'
    $request.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
    $request.CachePolicy = [Net.Cache.RequestCachePolicy]::new([Net.Cache.RequestCacheLevel]::NoCacheNoStore)
    $request.Headers['Cache-Control'] = 'no-cache, no-store'
    $request.Headers['Pragma'] = 'no-cache'
    if ($request.Proxy) { $request.Proxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials }
    return $request
}

# Stream raw bytes through .NET; paths are literal, including spaces and brackets.
# The Node tests supply independently calculated digests instead of using this
# implementation to calculate both the expected and the actual value.
function Get-ToolFileIdentity {
    param([Parameter(Mandatory=$true)][string]$Path)
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not [IO.File]::Exists($fullPath)) { throw "File not found: $Path" }
    $stream = [IO.File]::Open($fullPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $hasher = [Security.Cryptography.SHA256]::Create()
        try {
            $bytes = [long]$stream.Length
            $digestBytes = $hasher.ComputeHash($stream)
        } finally { $hasher.Dispose() }
    } finally { $stream.Dispose() }
    $digest = [BitConverter]::ToString($digestBytes).Replace('-', '').ToLowerInvariant()
    return @{ sha256 = $digest; bytes = $bytes }
}

# 2026-09-21: the publisher SHA-256 is the integrity gate; a SHA-256 match
# proves the exact bytes the publisher attested, so the declared size field is
# advisory. Microsoft's current catalog has been observed with correct hashes
# but stale size metadata, which must not block an otherwise verified file.
function Assert-ToolDownloadedFile {
    param([Parameter(Mandatory=$true)][string]$Path, [string]$Sha256,
          [long]$ExpectedSize = -1, [string]$Source = 'download')
    if ($Sha256 -and $Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid SHA-256 value.' }
    if ($ExpectedSize -lt -1) { throw 'Invalid expected file size.' }
    $identity = Get-ToolFileIdentity -Path $Path
    $size = [long]$identity.bytes
    $actual = [string]$identity.sha256
    if ($size -eq 0 -or ($Sha256 -and $actual -ne $Sha256)) {
        throw [IO.InvalidDataException]::new("Download integrity mismatch (SHA-256): $Source`n" +
            "Expected SHA-256: $Sha256`nActual SHA-256:   $actual`n" +
            "Declared bytes: $ExpectedSize; received file bytes: $size.`n" +
            'No files from this download were executed or extracted.')
    }
    $sizeMismatch = ($ExpectedSize -ge 0 -and $size -ne $ExpectedSize)
    if ($sizeMismatch) {
        Write-Warning "Declared size for $Source is $ExpectedSize bytes but the SHA-256-verified file is $size bytes; the declared size is treated as advisory."
    }
    return @{ sha256 = $actual; bytes = $size; sizeMismatch = $sizeMismatch }
}

function Invoke-ToolDownload {
    param([Parameter(Mandatory=$true)][string]$Source,
          [Parameter(Mandatory=$true)][string]$Destination, [string]$Sha256,
          [long]$ExpectedSize = -1, [string]$LogFile, [switch]$NoDownload)
    $initialUri = Assert-ToolDownloadUri $Source
    if ($Sha256 -and $Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid SHA-256 value.' }
    if ($ExpectedSize -lt -1) { throw 'Invalid expected file size.' }
    $cacheVerified = $false
    $cacheFailure = 'No cached file with a supplied SHA-256 is available.'
    if ($Sha256 -and [IO.File]::Exists([IO.Path]::GetFullPath($Destination))) {
        try {
            $null = Assert-ToolDownloadedFile -Path $Destination -Sha256 $Sha256 -ExpectedSize $ExpectedSize -Source $Source
            $cacheVerified = $true
        } catch [IO.InvalidDataException] {
            # Only invalid content is a cache miss. Permission, path, and runtime
            # errors must surface as themselves, not turn into an unrelated HTTP 404.
            $cacheFailure = $_.Exception.Message
        }
    }
    if ($cacheVerified) { return }
    if ($NoDownload) { throw "Offline cache unavailable: $Destination`n$cacheFailure" }
    if ($cacheFailure -ne 'No cached file with a supplied SHA-256 is available.') {
        Write-Warning "Replacing invalid cache after a verified download: $Destination`n$cacheFailure"
    }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Destination))) | Out-Null
    $partial = $Destination + '.' + [Guid]::NewGuid().ToString('N') + '.part'
    if (-not $LogFile) { $LogFile = $Destination + '.download.json' }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($LogFile))) | Out-Null
    $history = [Collections.Generic.List[object]]::new()
    $previousProtocol = [Net.ServicePointManager]::SecurityProtocol
    try {
        [Net.ServicePointManager]::SecurityProtocol = $previousProtocol -bor [Net.SecurityProtocolType]::Tls12
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            $record = [ordered]@{
                attempt = $attempt; requestedUrl = $Source; finalUrl = $null
                expectedSha256 = $Sha256; actualSha256 = $null
                expectedFileBytes = $ExpectedSize; actualFileBytes = $null
                responseContentLength = $null; contentEncoding = $null
                status = 'failed'; error = $null
            }
            try {
                $uri = $initialUri
                for ($redirect = 0; $redirect -le 8; $redirect++) {
                    $request = New-ToolDownloadRequest $uri
                    $response = $null
                    try {
                        $response = $request.GetResponse()
                        $record.finalUrl = $uri.AbsoluteUri
                        $code = [int]$response.StatusCode
                        if ($code -ge 300 -and $code -le 399) {
                            if ($redirect -eq 8 -or -not $response.Headers['Location']) { throw 'Invalid or excessive HTTP redirects.' }
                            $uri = Assert-ToolDownloadUri ([Uri]::new($uri, $response.Headers['Location']).AbsoluteUri)
                            continue
                        }
                        if ($code -ne 200) { throw "HTTP $code when downloading $Source" }
                        $record.responseContentLength = $response.ContentLength
                        $record.contentEncoding = [string]$response.Headers['Content-Encoding']
                        # AutomaticDecompression removes supported encodings. An
                        # unhandled encoding must never become a cached file.
                        if ($record.contentEncoding -and $record.contentEncoding -ne 'identity') {
                            throw "Unsupported remaining HTTP Content-Encoding: $($record.contentEncoding)"
                        }
                        $inputStream = $response.GetResponseStream()
                        try {
                            $outputStream = [IO.File]::Create($partial)
                            try { $inputStream.CopyTo($outputStream) }
                            finally { $outputStream.Dispose() }
                        } finally { $inputStream.Dispose() }
                        $downloadIdentity = Get-ToolFileIdentity -Path $partial
                        $record.actualFileBytes = [long]$downloadIdentity.bytes
                        $record.actualSha256 = [string]$downloadIdentity.sha256
                        # HTTP Content-Length describes the wire representation;
                        # after decompression it need not equal the file's size.
                        # The publisher SHA-256 is the integrity gate; the
                        # declared size is advisory (see Assert-ToolDownloadedFile).
                        $verified = Assert-ToolDownloadedFile -Path $partial -Sha256 $Sha256 -ExpectedSize $ExpectedSize -Source $Source
                        $record.sizeMismatch = [bool]$verified.sizeMismatch
                        break
                    } finally { if ($response) { $response.Dispose() } }
                }
                Move-Item -LiteralPath $partial -Destination $Destination -Force
                $record.status = if ($Sha256) { 'sha256-verified' } else { 'received-over-https' }
                if (-not ($record.PSObject.Properties['sizeMismatch'])) { $record.sizeMismatch = $false }
                return
            } catch {
                $record.error = $_.Exception.Message
                if ([IO.File]::Exists($partial)) { [IO.File]::Delete($partial) }
                if ($attempt -eq 3) {
                    throw "Download failed after $attempt attempts: $Source`n$($_.Exception.Message)`nDownload report: $LogFile"
                }
                Write-Host "[tools] Download attempt $attempt failed; retrying with cache bypass..."
                Start-Sleep -Seconds (2 * $attempt)
            } finally {
                $history.Add([pscustomobject]$record)
                $report = @{ schema = 1; completedAt = [DateTime]::UtcNow.ToString('o'); attempts = @($history.ToArray()) }
                [IO.File]::WriteAllText($LogFile, ($report | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
            }
        }
    } finally {
        if ([IO.File]::Exists($partial)) { [IO.File]::Delete($partial) }
        [Net.ServicePointManager]::SecurityProtocol = $previousProtocol
    }
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
            'Download' { Invoke-ToolDownload -Source $Source -Destination $Destination -Sha256 $Sha256 -ExpectedSize $ExpectedSize -LogFile $LogFile -NoDownload:$CacheOnly }
            'ExtractZip' { Expand-ToolZip -Source $Source -Destination $Destination -Prefix $Prefix }
            default { throw 'Specify -Operation Download or ExtractZip.' }
        }
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        [Console]::Error.WriteLine($_.ScriptStackTrace)
        exit 1
    }
}
