param(
    [Parameter(Mandatory = $true)]
    [string]$Branch,
    [string]$Base = "master",
    [string]$Path,
    [switch]$ForceInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Host "[worktree] $Message"
}

$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
    throw "Not inside a git repository."
}

if (-not $Path) {
    $safeBranch = $Branch -replace "[\\/]", "-"
    $Path = Join-Path $repoRoot ".worktrees\$safeBranch"
}

$resolvedPath = [System.IO.Path]::GetFullPath($Path)
$branchExists = $false

git show-ref --verify --quiet "refs/heads/$Branch"
if ($LASTEXITCODE -eq 0) {
    $branchExists = $true
}

if ($branchExists) {
    Write-Status "Creating worktree at $resolvedPath for existing branch '$Branch'..."
    git worktree add $resolvedPath $Branch
} else {
    Write-Status "Creating worktree at $resolvedPath with new branch '$Branch' from '$Base'..."
    git worktree add -b $Branch $resolvedPath $Base
}

if ($LASTEXITCODE -ne 0) {
    throw "Failed to create worktree."
}

$bootstrapScript = Join-Path $PSScriptRoot "bootstrap-worktree.ps1"
Write-Status "Bootstrapping dependencies..."
if ($ForceInstall) {
    & $bootstrapScript -WorktreePath $resolvedPath -ForceInstall
} else {
    & $bootstrapScript -WorktreePath $resolvedPath
}

if ($LASTEXITCODE -ne 0) {
    throw "Worktree created, but bootstrap failed."
}

Write-Status "Done. Worktree is ready at $resolvedPath"
