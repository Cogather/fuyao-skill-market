$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot '..\diagnose-codex-sandbox.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Missing diagnostic script: $scriptPath"
}

$content = Get-Content -LiteralPath $scriptPath -Raw
foreach ($requiredText in @('SeBatchLogonRight', 'SeDenyBatchLogonRight', '4625', 'Read-only')) {
    if ($content -notmatch [regex]::Escape($requiredText)) {
        throw "Diagnostic script is missing required coverage: $requiredText"
    }
}

foreach ($forbiddenPattern in @(
    'secedit\s+/configure',
    'Set-LocalUser',
    'New-LocalUser',
    'Remove-LocalUser',
    'Add-LocalGroupMember'
)) {
    if ($content -match $forbiddenPattern) {
        throw "Diagnostic script must be read-only; forbidden command detected: $forbiddenPattern"
    }
}

Write-Output 'PASS: diagnostic script contract is satisfied.'
