param(
    [switch]$Apply,
    [string]$ZoneId = "1756d16d2604a8b6810292f069097299",
    [string[]]$Hostnames = @(
        "capveri.com",
        "www.capveri.com",
        "app.capveri.com",
        "api.capveri.com"
    ),
    [string]$SunsetWorkerName = "capveri-sunset-gone"
)

$ErrorActionPreference = "Stop"
$TargetRecordTypes = [System.Collections.Generic.HashSet[string]]::new(
    [string[]]@("A", "AAAA", "CNAME"),
    [System.StringComparer]::OrdinalIgnoreCase
)

function Invoke-CloudflareApi {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "DELETE")]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [hashtable]$Headers
    )

    $response = Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers
    if (-not $response.success) {
        $errors = ($response.errors | ConvertTo-Json -Compress)
        throw "Cloudflare API call failed: $Method $Uri errors=$errors"
    }

    return $response
}

function Invoke-WranglerDeleteWorker {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WorkerName
    )

    $output = & npx wrangler delete $WorkerName --force 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-Host $_ }

    if ($exitCode -eq 0) {
        return
    }

    $outputText = $output | Out-String
    if ($outputText -match "This Worker does not exist on your account" -or $outputText -match "\[code:\s*10007\]") {
        Write-Host "Worker '$WorkerName' is already absent."
        return
    }

    throw "Failed to delete Worker '$WorkerName' with exit code $exitCode."
}

if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
    throw "Set CLOUDFLARE_API_TOKEN to a token with Zone:DNS:Edit for zone $ZoneId."
}

$headers = @{
    Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN"
}

$hostSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($hostname in $Hostnames) {
    [void]$hostSet.Add($hostname)
}

$records = @()
$page = 1
do {
    $uri = "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records?per_page=100&page=$page"
    $response = Invoke-CloudflareApi -Method GET -Uri $uri -Headers $headers
    $records += @(
        $response.result |
            Where-Object {
                $hostSet.Contains([string]$_.name) -and $TargetRecordTypes.Contains([string]$_.type)
            }
    )
    $totalPages = [int]$response.result_info.total_pages
    $page++
} while ($page -le $totalPages)

if ($records.Count -eq 0) {
    Write-Host "No A, AAAA, or CNAME DNS records found for target CapVeri hostnames."
} else {
    Write-Host "Target A/AAAA/CNAME DNS records:"
    $records |
        Sort-Object name, type, content |
        Select-Object id, type, name, content, proxied |
        Format-Table -AutoSize
}

if (-not $Apply) {
    Write-Host ""
    Write-Host "Dry run only. Re-run with -Apply to delete the records above and then delete Worker '$SunsetWorkerName'."
    exit 0
}

foreach ($record in $records) {
    Write-Host "Deleting DNS record $($record.type) $($record.name) -> $($record.content) [$($record.id)]"
    $deleteUri = "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records/$($record.id)"
    [void](Invoke-CloudflareApi -Method DELETE -Uri $deleteUri -Headers $headers)
}

Write-Host "Deleting interim sunset Worker '$SunsetWorkerName'."
Invoke-WranglerDeleteWorker -WorkerName $SunsetWorkerName

Write-Host "Final verification probes:"
foreach ($hostname in $Hostnames) {
    Resolve-DnsName $hostname -ErrorAction SilentlyContinue |
        Select-Object Name, Type, NameHost, IPAddress |
        Format-Table -AutoSize
}

Write-Host "CapVeri DNS teardown finalize step finished."
