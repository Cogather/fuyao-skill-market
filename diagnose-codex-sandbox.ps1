<#
.SYNOPSIS
    Read-only diagnostics for Codex Desktop sandbox launch failures (for example Win32 error 1385).

.DESCRIPTION
    The script exports the effective local user-rights policy and inspects recent Security event 4625
    failures. It does not change local security policy, accounts, groups, services, or files outside
    the report it writes beside this script.

.EXAMPLE
    Run in an elevated PowerShell window:
      .\diagnose-codex-sandbox.ps1
#>

[CmdletBinding()]
param(
    [ValidateRange(1, 30)]
    [int]$Days = 7
)

$ErrorActionPreference = 'Stop'
$reportPath = Join-Path $PSScriptRoot 'codex-sandbox-diagnostic-report.txt'
$policyPath = Join-Path $env:TEMP ("codex-user-rights-{0}.inf" -f [guid]::NewGuid())
$lines = [System.Collections.Generic.List[string]]::new()

function Add-ReportLine {
    param([string]$Text)
    $lines.Add($Text)
}

function Get-EventDataValue {
    param(
        [System.Diagnostics.Eventing.Reader.EventRecord]$Event,
        [string]$Name
    )

    $xml = [xml]$Event.ToXml()
    $node = @($xml.Event.EventData.Data | Where-Object { $_.Name -eq $Name })[0]
    if ($null -eq $node) { return $null }
    return $node.'#text'
}

try {
    Add-ReportLine 'Codex sandbox diagnostics (Read-only)'
    Add-ReportLine ("Generated: {0:yyyy-MM-dd HH:mm:ss zzz}" -f (Get-Date))
    Add-ReportLine ''
    Add-ReportLine '=== Current identity ==='
    Add-ReportLine ("User: {0}" -f (whoami))
    Add-ReportLine ''
    Add-ReportLine '=== Effective local user-rights policy ==='

    & secedit.exe /export /cfg $policyPath /areas USER_RIGHTS | Out-Null
    $rights = Get-Content -LiteralPath $policyPath | Where-Object {
        $_ -match '^SeBatchLogonRight\s*=' -or $_ -match '^SeDenyBatchLogonRight\s*='
    }
    if ($rights) {
        $rights | ForEach-Object { Add-ReportLine $_ }
    } else {
        Add-ReportLine 'No explicit SeBatchLogonRight or SeDenyBatchLogonRight entries were exported.'
    }

    Add-ReportLine ''
    Add-ReportLine ("=== Security event 4625 failures during last {0} day(s) ===" -f $Days)
    $startTime = (Get-Date).AddDays(-$Days)
    try {
        $events = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4625; StartTime = $startTime } -ErrorAction Stop
        $matched = $events | Where-Object {
            (Get-EventDataValue -Event $_ -Name 'Status') -eq '0xC000015B' -or
            (Get-EventDataValue -Event $_ -Name 'SubStatus') -eq '0xC000015B' -or
            (Get-EventDataValue -Event $_ -Name 'LogonType') -eq '4'
        }

        if (-not $matched) {
            Add-ReportLine 'No matching failed batch-logon events were found.'
        } else {
            foreach ($event in $matched | Select-Object -First 50) {
                $account = Get-EventDataValue -Event $event -Name 'TargetUserName'
                $domain = Get-EventDataValue -Event $event -Name 'TargetDomainName'
                $logonType = Get-EventDataValue -Event $event -Name 'LogonType'
                $status = Get-EventDataValue -Event $event -Name 'Status'
                $process = Get-EventDataValue -Event $event -Name 'ProcessName'
                Add-ReportLine ("{0:yyyy-MM-dd HH:mm:ss} | account={1}\{2} | logonType={3} | status={4} | process={5}" -f $event.TimeCreated, $domain, $account, $logonType, $status, $process)
            }
        }
    } catch {
        Add-ReportLine ("Could not read the Security log: {0}" -f $_.Exception.Message)
        Add-ReportLine 'Run this script from an elevated PowerShell window to include Security event 4625 details.'
    }

    Add-ReportLine ''
    Add-ReportLine '=== Interpretation ==='
    Add-ReportLine 'Win32 error 1385 maps to STATUS_LOGON_TYPE_NOT_GRANTED (0xC000015B).'
    Add-ReportLine 'If the report lists an account with logonType=4 and status=0xC000015B, grant that exact account or its required group “Log on as a batch job”, and ensure it is not listed in “Deny log on as a batch job”.'
    Add-ReportLine 'Do not broadly add users or disable the denial policy without first identifying the failed account.'
} finally {
    if (Test-Path -LiteralPath $policyPath) {
        Remove-Item -LiteralPath $policyPath -Force
    }
}

$lines | Set-Content -LiteralPath $reportPath -Encoding utf8
Get-Content -LiteralPath $reportPath
Write-Output "`nReport saved to: $reportPath"
