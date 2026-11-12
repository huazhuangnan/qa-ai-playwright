# Install or remove the user-level QA command.
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath('LocalApplicationData') }
$installRoot = Join-Path $localAppData 'qa-ai-playwright'
$binDir = Join-Path $installRoot 'bin'
$commandPath = Join-Path $binDir 'qa.cmd'
$marker = 'rem QA-AI-PLAYWRIGHT MANAGED COMMAND'
$expectedCommand = @('@echo off', $marker, 'call "%LOCALAPPDATA%\qa-ai-playwright\packages\qa-cli\bin\qa.cmd" %*', 'exit /b %errorlevel%')

function Test-ManagedCommand([string]$Path) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    if ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { return $false }
    $actual = @(Get-Content -LiteralPath $Path)
    if ($actual.Count -ne $expectedCommand.Count) { return $false }
    for ($index = 0; $index -lt $expectedCommand.Count; $index++) {
        if ($actual[$index] -cne $expectedCommand[$index]) { return $false }
    }
    return $true
}

function Normalize-PathEntry([string]$Path) {
    $value = $Path.Trim().Trim('"')
    if (!$value) { return '' }
    $value = [Environment]::ExpandEnvironmentVariables($value)
    try {
        $full = [IO.Path]::GetFullPath($value)
        if ($full -eq [IO.Path]::GetPathRoot($full)) { return $full }
        return $full.TrimEnd([char[]]@('\', '/'))
    } catch {
        return $value.TrimEnd([char[]]@('\', '/'))
    }
}

function Test-ReparsePoint([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    return $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = if ($null -eq $userPath) { @() } else { @($userPath.Split([char]';')) }
$normalizedBin = Normalize-PathEntry $binDir
if ($Uninstall) {
    if (Test-ReparsePoint $installRoot) { throw 'Refusing to uninstall a linked installation root' }
    if ((Test-Path -LiteralPath $commandPath) -and !(Test-ManagedCommand $commandPath)) { throw 'Command was modified; installation preserved' }
    $envRoot = if ($env:QA_ROOT) { $env:QA_ROOT } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.qa-ai-playwright' }
    if ((Test-Path -LiteralPath (Join-Path $envRoot '.qa-managed')) -and !(Test-Path -LiteralPath (Join-Path $installRoot '.environment-cleaned'))) {
        $manifestPath = Join-Path $installRoot '.files.json'
        if (!(Test-Path -LiteralPath (Join-Path $installRoot '.qa-managed')) -or !(Test-Path -LiteralPath $manifestPath)) { throw 'Installation ownership cannot be verified' }
        foreach ($file in (Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json)) {
            $relative = [string]$file.path
            if (!$relative.StartsWith('packages\') -or $relative.Contains('..')) { throw 'Invalid installation manifest' }
            $target = Join-Path $installRoot $relative
            $parent = Split-Path -Parent $target
            while ($parent.Length -ge $installRoot.Length) {
                if (!(Test-Path -LiteralPath $parent) -or ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked or missing installation path' }
                if ($parent -ieq $installRoot) { break }
                $parent = Split-Path -Parent $parent
            }
            if (!(Test-Path -LiteralPath $target -PathType Leaf) -or ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.hash) { throw 'Installed files changed; environment cleanup cancelled' }
        }
        & (Join-Path $installRoot 'packages/qa-cli/bin/qa.cmd') env uninstall
        if ($LASTEXITCODE -ne 0) { throw 'Environment cleanup failed; installation preserved' }
        New-Item -ItemType File -Path (Join-Path $installRoot '.environment-cleaned') | Out-Null
    }
    if ((Test-Path -LiteralPath (Join-Path $installRoot '.qa-managed')) -and (Test-Path -LiteralPath (Join-Path $installRoot '.path-added'))) {
        $entries = @($entries | Where-Object { (Normalize-PathEntry $_) -ine $normalizedBin })
        [Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
        Remove-Item -LiteralPath (Join-Path $installRoot '.path-added')
    }
    if (Test-ManagedCommand $commandPath) {
        Remove-Item -LiteralPath $commandPath
    }
    $manifestPath = Join-Path $installRoot '.files.json'
    if ((Test-Path -LiteralPath (Join-Path $installRoot '.qa-managed')) -and (Test-Path -LiteralPath $manifestPath)) {
        $files = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
        $remaining = $false
        foreach ($file in $files) {
            $relative = [string]$file.path
            if (!$relative.StartsWith('packages\') -or $relative.Contains('..')) { continue }
            $target = Join-Path $installRoot $relative
            $parent = Split-Path -Parent $target
            $safe = $true
            while ($parent.Length -ge $installRoot.Length) {
                if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { $safe = $false; break }
                if ($parent -ieq $installRoot) { break }
                $parent = Split-Path -Parent $parent
            }
            if (!$safe -or ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint))) { $remaining = $true; continue }
            if ((Test-Path -LiteralPath $target -PathType Leaf) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $file.hash) {
                Remove-Item -LiteralPath $target
            } elseif (Test-Path -LiteralPath $target) {
                $remaining = $true
            }
        }
        if (!$remaining) { Remove-Item -LiteralPath $manifestPath, (Join-Path $installRoot '.qa-managed'); Remove-Item -LiteralPath (Join-Path $installRoot '.environment-cleaned') -ErrorAction SilentlyContinue }
        $packagesPath = Join-Path $installRoot 'packages'
        if ((Test-Path -LiteralPath $packagesPath -PathType Container) -and !(Test-ReparsePoint $packagesPath)) {
            Get-ChildItem -LiteralPath $packagesPath -Directory -Recurse |
                Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
                Sort-Object { $_.FullName.Length } -Descending |
                ForEach-Object { if (!(Get-ChildItem -LiteralPath $_.FullName -Force)) { Remove-Item -LiteralPath $_.FullName } }
            if (!(Get-ChildItem -LiteralPath $packagesPath -Force)) { Remove-Item -LiteralPath $packagesPath }
        }
        if (!(Get-ChildItem -LiteralPath $installRoot -Force)) { Remove-Item -LiteralPath $installRoot }
    }
    Write-Host "Command removed. Modified or untracked files are preserved at $installRoot."
    exit 0
}
if ((Test-Path -LiteralPath (Join-Path $installRoot '.qa-managed')) -and (Test-Path -LiteralPath (Join-Path $installRoot '.files.json'))) {
    if (Test-ReparsePoint $installRoot) { throw 'Refusing to upgrade a linked installation root' }
    if (!(Test-ManagedCommand $commandPath)) { throw 'Installation ownership cannot be verified' }
    $previousFiles = @(Get-Content -Raw -LiteralPath (Join-Path $installRoot '.files.json') | ConvertFrom-Json)
    foreach ($file in $previousFiles) {
        if (!$file.path.StartsWith('packages\') -or $file.path.Contains('..')) { throw 'Invalid installation manifest' }
        $target = Join-Path $installRoot $file.path
        if (!(Test-Path -LiteralPath $target -PathType Leaf) -or ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.hash) { throw "Modified installed file: $($file.path)" }
    }
    $known = @{}; foreach ($file in $previousFiles) { $known[$file.path] = $true }
    foreach ($item in (Get-ChildItem -LiteralPath (Join-Path $installRoot 'packages') -Recurse -Force)) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (!$item.PSIsContainer -and !$known.ContainsKey($item.FullName.Substring($installRoot.Length + 1)))) { throw "Untracked installed file: $($item.FullName)" }
    }
    $stage = Join-Path $installRoot ('.upgrade-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $stage | Out-Null
    $upgradeComplete = $false
    try {
        Copy-Item -LiteralPath (Join-Path $sourceRoot 'packages') -Destination (Join-Path $stage 'packages') -Recurse
        $newFiles = @(Get-ChildItem -LiteralPath (Join-Path $stage 'packages') -File -Recurse | ForEach-Object { @{ path = 'packages\' + $_.FullName.Substring((Join-Path $stage 'packages').Length + 1); hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })
        ConvertTo-Json -InputObject $newFiles | Set-Content -LiteralPath (Join-Path $stage 'files.json') -Encoding UTF8
        Copy-Item -LiteralPath (Join-Path $installRoot '.files.json') -Destination (Join-Path $stage 'previous-files.json')
        Move-Item -LiteralPath (Join-Path $installRoot 'packages') -Destination (Join-Path $stage 'previous')
        try {
            Move-Item -LiteralPath (Join-Path $stage 'packages') -Destination (Join-Path $installRoot 'packages')
            Copy-Item -LiteralPath (Join-Path $stage 'files.json') -Destination (Join-Path $installRoot '.files.json') -Force
        } catch {
            if (Test-Path -LiteralPath (Join-Path $installRoot 'packages')) { Remove-Item -LiteralPath (Join-Path $installRoot 'packages') -Recurse -Force }
            Move-Item -LiteralPath (Join-Path $stage 'previous') -Destination (Join-Path $installRoot 'packages')
            Copy-Item -LiteralPath (Join-Path $stage 'previous-files.json') -Destination (Join-Path $installRoot '.files.json') -Force
            throw
        }
        $upgradeComplete = $true
    } finally {
        if ($upgradeComplete -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
        elseif (Test-Path -LiteralPath $stage) { Write-Warning "Upgrade failed; recovery files are preserved at $stage" }
    }
    Write-Host 'Updated qa.'
    exit 0
}
if (Get-Command qa -ErrorAction SilentlyContinue) { throw 'A qa command already exists on PATH' }
$preservedRoot = $false
$existingRoot = Get-Item -LiteralPath $installRoot -Force -ErrorAction SilentlyContinue
if ($existingRoot) {
    if (!$existingRoot.PSIsContainer -or ($existingRoot.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Refusing to replace linked or non-directory $installRoot"
    }
    $unexpected = @(Get-ChildItem -LiteralPath $installRoot -Force | Where-Object { $_.Name -cne 'node' })
    if ($unexpected.Count) {
        throw "Refusing to replace existing $installRoot; review existing files first"
    }
    $nodeRoot = Get-Item -LiteralPath (Join-Path $installRoot 'node') -Force -ErrorAction SilentlyContinue
    if ($nodeRoot -and (!$nodeRoot.PSIsContainer -or ($nodeRoot.Attributes -band [IO.FileAttributes]::ReparsePoint))) {
        throw "Refusing to reuse linked or non-directory $installRoot/node"
    }
    $preservedRoot = $true
}
if ((Test-Path -LiteralPath $commandPath) -and !(Test-ManagedCommand $commandPath)) {
    throw "Refusing to replace $commandPath"
}
$installMarker = 'qa-ai-playwright-install-v1'
$createdInstall = $true
$installComplete = $false
try {
    New-Item -ItemType Directory -Force -Path $installRoot, $binDir | Out-Null
    Set-Content -LiteralPath (Join-Path $installRoot '.qa-managed') -Value $installMarker -NoNewline -Encoding ASCII
    if ($sourceRoot -ine $installRoot) {
        $targetPackages = Join-Path $installRoot 'packages'
        New-Item -ItemType Directory -Force -Path $targetPackages | Out-Null
        Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'packages') -Force | Copy-Item -Destination $targetPackages -Recurse -Force
    }
    $files = @(Get-ChildItem -LiteralPath (Join-Path $installRoot 'packages') -File -Recurse | ForEach-Object {
        @{ path = $_.FullName.Substring($installRoot.Length + 1); hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
    ConvertTo-Json -InputObject $files | Set-Content -LiteralPath (Join-Path $installRoot '.files.json') -Encoding UTF8
    $expectedCommand | Set-Content -LiteralPath $commandPath -Encoding ASCII
    if (!($entries | Where-Object { (Normalize-PathEntry $_) -ieq $normalizedBin })) {
        [Environment]::SetEnvironmentVariable('Path', (($entries + $binDir) -join ';'), 'User')
        New-Item -ItemType File -Path (Join-Path $installRoot '.path-added') | Out-Null
    }
    $installComplete = $true
} finally {
    if (!$installComplete) {
        $cleanupFailed = $false
        if ($createdInstall) {
            try {
                if ($preservedRoot) {
                    foreach ($name in @('packages', 'bin')) {
                        $path = Join-Path $installRoot $name
                        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
                    }
                    foreach ($name in @('.files.json', '.qa-managed', '.path-added', '.environment-cleaned')) {
                        Remove-Item -LiteralPath (Join-Path $installRoot $name) -Force -ErrorAction SilentlyContinue
                    }
                } else {
                    $managedPath = Join-Path $installRoot '.qa-managed'
                    if (!(Test-Path -LiteralPath $managedPath) -or ((Get-Content -Raw -LiteralPath $managedPath).Trim() -eq $installMarker)) {
                        Remove-Item -LiteralPath $installRoot -Recurse -Force
                    }
                }
            } catch {
                $cleanupFailed = $true
            }
        }
        try {
            [Environment]::SetEnvironmentVariable('Path', $userPath, 'User')
        } catch {
            $cleanupFailed = $true
        }
        if ($cleanupFailed) {
            Write-Warning "Installation cleanup was incomplete; inspect $installRoot"
        }
    }
}
Write-Host 'Installed qa. Start a new terminal to update PATH.'
