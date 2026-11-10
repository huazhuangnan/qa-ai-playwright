# Prefer PowerShell 7; remain compatible with Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
Write-Host "PowerShell: $($PSVersionTable.PSVersion)"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Normalize-Path([string]$Value) {
    $full = [IO.Path]::GetFullPath($Value)
    $root = [IO.Path]::GetPathRoot($full)
    if ($full -eq $root) {
        return $full
    }
    return $full.TrimEnd([char[]]@('\', '/'))
}

function Path-Equals([string]$Left, [string]$Right) {
    return [StringComparer]::OrdinalIgnoreCase.Equals(
        (Normalize-Path $Left),
        (Normalize-Path $Right)
    )
}

function Is-Child-Path([string]$Child, [string]$Parent) {
    $normalizedChild = Normalize-Path $Child
    $normalizedParent = Normalize-Path $Parent
    $prefix = $normalizedParent.TrimEnd([char[]]@('\', '/')) + '\'
    return $normalizedChild.StartsWith(
        $prefix,
        [StringComparison]::OrdinalIgnoreCase
    )
}

$rawArguments = @($args)
$cliArguments = @()
$rootPath = if ($env:QA_ROOT) {
    $env:QA_ROOT
} else {
    Join-Path (Get-Location).ProviderPath '.qa-env'
}
for ($index = 0; $index -lt $rawArguments.Count; $index++) {
    $argument = $rawArguments[$index]
    if ($argument -eq 'run') {
        $cliArguments += $rawArguments[$index..($rawArguments.Count - 1)]
        break
    }
    if ($argument -eq '--root') {
        if ($index + 1 -ge $rawArguments.Count) {
            throw '--root requires a directory'
        }
        $index++
        $rootPath = $rawArguments[$index]
    } elseif ($argument -like '--root=*') {
        $rootPath = $argument.Substring(7)
    } else {
        $cliArguments += $argument
    }
}

$repoPath = Normalize-Path (Join-Path $PSScriptRoot '../..')
$rootPath = Normalize-Path $rootPath
if ((Test-Path -LiteralPath $rootPath -PathType Leaf)) {
    throw 'Environment root must be a directory'
}
if (
    (Test-Path -LiteralPath $rootPath) -and
    ((Get-Item -LiteralPath $rootPath).Attributes -band [IO.FileAttributes]::ReparsePoint)
) {
    throw 'Environment root must not be a link'
}
if (
    (Path-Equals $rootPath ([IO.Path]::GetPathRoot($rootPath))) -or
    (Path-Equals $rootPath (Get-Location).ProviderPath) -or
    (Path-Equals $rootPath $repoPath) -or
    (Is-Child-Path $repoPath $rootPath)
) {
    throw 'Use a dedicated child directory for --root'
}

$runtimeFile = Join-Path $repoPath 'src/runtime-versions.env'
Get-Content -LiteralPath $runtimeFile | ForEach-Object {
    if ($_ -match '^QA_NODE_MAJOR=(.+)$') {
        if (![Environment]::GetEnvironmentVariable('QA_NODE_MAJOR', 'Process')) {
            [Environment]::SetEnvironmentVariable(
                'QA_NODE_MAJOR',
                $matches[1],
                'Process'
            )
        }
    }
}
if ($env:QA_NODE_MAJOR -notmatch '^(22|24|26)$') {
    throw 'Unsupported QA_NODE_MAJOR; use a Playwright-supported LTS version'
}

$env:QA_ROOT = $rootPath
$env:QA_REPO = $repoPath
$nodePath = Join-Path $rootPath 'runtime/node/node.exe'
$marker = Join-Path $rootPath '.qa-managed'
$first = if ($cliArguments.Count) { $cliArguments[0] } else { 'help' }
if ($first -in @('help', '--help', '-h')) {
    @(
        'qa env init <python|typescript|both> [--full]',
        'qa env check <python|typescript|both> [--full]',
        'qa env uninstall',
        'qa project init <project> --language <python|typescript> [--browser <name>]',
        '  --language alias: --语言',
        'qa project check <project> [--browser <name>]',
        'qa project uninstall <project>',
        'qa doctor',
        'qa shell',
        'qa mcp add <name>',
        'qa mcp remove <name>',
        'qa mcp list',
        'qa run <command> [...]'
    ) | Write-Host
    exit 0
}
if (
    $first -eq 'env' -and
    $cliArguments.Count -ge 2 -and
    $cliArguments[1] -in @('init', 'check') -and
    ($cliArguments.Count -lt 3 -or $cliArguments[2] -notin @('python', 'typescript', 'both'))
) {
    throw "Usage: qa env $($cliArguments[1]) <python|typescript|both>"
}

$readOnly = (
    $first -eq 'doctor' -or
    ($cliArguments.Count -ge 2 -and $cliArguments[1] -eq 'check') -or
    $first -eq 'project'
)
$uninstallEnvironment = (
    $cliArguments.Count -ge 2 -and
    $first -eq 'env' -and
    $cliArguments[1] -eq 'uninstall'
)

if (!(Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    if ($readOnly) {
        Write-Host "Environment not initialized: $rootPath"
        exit 1
    }
    if ($uninstallEnvironment) {
        if (!(Test-Path -LiteralPath $rootPath)) {
            Write-Host 'Nothing to uninstall'
            exit 0
        }
        if (
            !(Test-Path -LiteralPath $marker -PathType Leaf) -or
            (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -ne 'qa-local-environment-v1'
        ) {
            throw 'Refusing to remove an unmanaged directory'
        }
        if ((Get-Item -LiteralPath $rootPath).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Refusing to remove a linked root'
        }
        Remove-Item -LiteralPath $rootPath -Recurse -Force
        exit 0
    }
    if (
        !($first -eq 'env' -and $cliArguments.Count -ge 2 -and $cliArguments[1] -eq 'init')
    ) {
        throw "Environment not initialized: $rootPath. Run qa env init <python|typescript|both>"
    }
    if (Test-Path -LiteralPath $marker -PathType Leaf) {
        if ((Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -ne 'qa-local-environment-v1') {
            throw 'Invalid environment marker'
        }
    } elseif (
        (Test-Path -LiteralPath $rootPath) -and
        @(Get-ChildItem -LiteralPath $rootPath -Force).Count
    ) {
        throw 'Root already contains unmanaged files'
    }

    New-Item -ItemType Directory -Force -Path $rootPath | Out-Null
    [IO.File]::WriteAllText($marker, 'qa-local-environment-v1')
    $architecture = if (
        $env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or
        $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64'
    ) {
        'arm64'
    } else {
        'x64'
    }
    $releaseBase = "https://nodejs.org/dist/latest-v$env:QA_NODE_MAJOR.x"
    $checksumFile = Join-Path $rootPath 'cache/downloads/node-SHASUMS256.txt'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $checksumFile) | Out-Null
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 "$releaseBase/SHASUMS256.txt" -OutFile $checksumFile
    $pattern = '^([a-fA-F0-9]{64})\s+\*?(node-v[0-9.]+\-win-' + $architecture + '\.zip)$'
    $release = Get-Content -LiteralPath $checksumFile | ForEach-Object {
        if ($_ -match $pattern) {
            [pscustomobject]@{
                Hash = $matches[1]
                Name = $matches[2]
            }
        }
    } | Select-Object -First 1
    if (!$release) {
        throw "Node $env:QA_NODE_MAJOR release file was not found"
    }
    $archive = Join-Path $rootPath "cache/downloads/$($release.Name)"
    if (
        !(Test-Path -LiteralPath $archive -PathType Leaf) -or
        (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $release.Hash.ToLower()
    ) {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 300 "$releaseBase/$($release.Name)" -OutFile $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $release.Hash.ToLower()) {
        throw 'Node checksum mismatch'
    }

    $staging = Join-Path $rootPath 'runtime/node-extract'
    $nodeDirectory = Join-Path $rootPath 'runtime/node'
    if (!(Is-Child-Path $staging $rootPath) -or !(Is-Child-Path $nodeDirectory $rootPath)) {
        throw 'Unsafe Node installation path'
    }
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    }
    if (Test-Path -LiteralPath $nodeDirectory) {
        Remove-Item -LiteralPath $nodeDirectory -Recurse -Force
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
    $candidates = @(Get-ChildItem -LiteralPath $staging -Directory)
    if ($candidates.Count -ne 1) {
        throw 'Unexpected Node archive layout'
    }
    [IO.Directory]::Move($candidates[0].FullName, $nodeDirectory)
    Remove-Item -LiteralPath $staging -Force
}

if (!(Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'Managed Node is missing; remove the environment and rerun env init'
}
$nodeVersion = & $nodePath --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch ('^v' + $env:QA_NODE_MAJOR + '\.')) {
    throw "Managed Node $env:QA_NODE_MAJOR is unavailable"
}
& $nodePath --experimental-strip-types (Join-Path $repoPath 'src/qa-cli.ts') @cliArguments
$exitCode = $LASTEXITCODE
if ($exitCode -eq 20) {
    if (
        !(Test-Path -LiteralPath $marker -PathType Leaf) -or
        (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -ne 'qa-local-environment-v1' -or
        ((Get-Item -LiteralPath $rootPath).Attributes -band [IO.FileAttributes]::ReparsePoint)
    ) {
        throw 'Uninstall root validation failed'
    }
    Remove-Item -LiteralPath $rootPath -Recurse -Force
    Write-Host "Uninstalled: $rootPath"
    exit 0
}
exit $exitCode
