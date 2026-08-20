param(
    [string]$WorktreePath = ".",
    [switch]$ForceInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DependencyHash {
    param(
        [string]$ProjectPath,
        [string[]]$Files
    )

    $parts = @()
    foreach ($relative in $Files) {
        $full = Join-Path $ProjectPath $relative
        if (Test-Path $full) {
            $hash = (Get-FileHash -Path $full -Algorithm SHA256).Hash
            $parts += "$relative=$hash"
        }
    }
    return ($parts -join "|")
}

function Write-Status {
    param([string]$Message)
    Write-Host "[bootstrap] $Message"
}

function Test-PythonMinorVersion {
    param(
        [string]$PythonExecutable,
        [string]$ExpectedVersion = "3.11"
    )

    if (-not (Test-Path $PythonExecutable)) {
        return $false
    }

    $version = (& $PythonExecutable -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
    return $LASTEXITCODE -eq 0 -and $version -eq $ExpectedVersion
}

function Resolve-PythonLauncher {
    $pyCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCommand) {
        & $pyCommand.Source -3.11 -c "import sys" *> $null
        if ($LASTEXITCODE -eq 0) {
            return @{
                Executable = $pyCommand.Source
                PrefixArgs = @("-3.11")
            }
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $version = (& $pythonCommand.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
        if ($LASTEXITCODE -eq 0 -and $version -eq "3.11") {
            return @{
                Executable = $pythonCommand.Source
                PrefixArgs = @()
            }
        }
    }

    throw "Python 3.11 is required for backend worktrees. Install Python 3.11 and ensure 'py -3.11' or a Python 3.11 'python' executable is available."
}

$root = (Resolve-Path $WorktreePath).Path
$stateDir = Join-Path $root ".worktree-state"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

Write-Status "Using worktree at $root"

# Backend
$backendDir = Join-Path $root "backend"
$resolvedBackendDir = (Resolve-Path $backendDir).Path
$backendStamp = Join-Path $stateDir "backend-deps.sha256"
$backendHash = Get-DependencyHash -ProjectPath $backendDir -Files @("pyproject.toml", "requirements.txt")
$backendVenvDir = Join-Path $backendDir ".venv"
$backendVenvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$backendVenvIs311 = Test-PythonMinorVersion -PythonExecutable $backendVenvPython
$backendNeedsInstall = $ForceInstall -or -not (Test-Path $backendVenvPython) -or -not $backendVenvIs311 -or -not (Test-Path $backendStamp) -or ((Get-Content $backendStamp -Raw) -ne $backendHash)

if ($backendNeedsInstall) {
    Write-Status "Installing backend dependencies..."
    if ((Test-Path $backendVenvPython) -and -not $backendVenvIs311) {
        $resolvedVenvDir = (Resolve-Path $backendVenvDir).Path
        if (-not $resolvedVenvDir.StartsWith($resolvedBackendDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to recreate backend virtual environment outside the backend directory."
        }

        Write-Status "Recreating backend virtual environment with Python 3.11..."
        Remove-Item -LiteralPath $resolvedVenvDir -Recurse -Force
    }

    if (-not (Test-Path $backendVenvPython)) {
        $pythonLauncher = Resolve-PythonLauncher
        Push-Location $backendDir
        try {
            & $pythonLauncher.Executable @($pythonLauncher.PrefixArgs + @("-m", "venv", ".venv"))
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to create backend virtual environment."
            }
        } finally {
            Pop-Location
        }
    }

    Push-Location $backendDir
    try {
        & $backendVenvPython -m pip install -e ".[dev]"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install backend dependencies."
        }

        if (Test-Path "requirements.txt") {
            & $backendVenvPython -m pip install -r "requirements.txt"
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to install backend requirements.txt dependencies."
            }
        }
    } finally {
        Pop-Location
    }

    Set-Content -Path $backendStamp -Value $backendHash
} else {
    Write-Status "Backend dependencies are up to date."
}

# Frontend
$frontendDir = Join-Path $root "frontend"
$frontendStamp = Join-Path $stateDir "frontend-deps.sha256"
$frontendHash = Get-DependencyHash -ProjectPath $frontendDir -Files @("package-lock.json", "package.json")
$frontendModules = Join-Path $frontendDir "node_modules"
$frontendNeedsInstall = $ForceInstall -or -not (Test-Path $frontendModules) -or -not (Test-Path $frontendStamp) -or ((Get-Content $frontendStamp -Raw) -ne $frontendHash)

if ($frontendNeedsInstall) {
    Write-Status "Installing frontend dependencies..."
    Push-Location $frontendDir
    try {
        if (Test-Path "package-lock.json") {
            npm ci
        } else {
            npm install
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install frontend dependencies."
        }
    } finally {
        Pop-Location
    }
    Set-Content -Path $frontendStamp -Value $frontendHash
} else {
    Write-Status "Frontend dependencies are up to date."
}

# Marketing
$marketingDir = Join-Path $root "marketing"
$marketingStamp = Join-Path $stateDir "marketing-deps.sha256"
$marketingHash = Get-DependencyHash -ProjectPath $marketingDir -Files @("package-lock.json", "package.json")
$marketingModules = Join-Path $marketingDir "node_modules"
$marketingNeedsInstall = $ForceInstall -or -not (Test-Path $marketingModules) -or -not (Test-Path $marketingStamp) -or ((Get-Content $marketingStamp -Raw) -ne $marketingHash)

if ($marketingNeedsInstall) {
    Write-Status "Installing marketing dependencies..."
    Push-Location $marketingDir
    try {
        if (Test-Path "package-lock.json") {
            npm ci
        } else {
            npm install
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install marketing dependencies."
        }
    } finally {
        Pop-Location
    }
    Set-Content -Path $marketingStamp -Value $marketingHash
} else {
    Write-Status "Marketing dependencies are up to date."
}

Write-Status "Bootstrap complete."
