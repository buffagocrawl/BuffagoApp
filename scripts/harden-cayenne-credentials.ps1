[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$file = Join-Path $root '.env.cayenne.local'
if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
  throw 'CAYENNE_AUTH_BLOCKED: Local credential file is unavailable.'
}

$acl = Get-Acl -LiteralPath $file
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Output "Owner: $($acl.Owner)"
Write-Output 'Current access principals:'
$acl.Access | ForEach-Object { Write-Output "- $($_.IdentityReference.Value)" }
if (-not $Apply) {
  Write-Output 'No ACL changes made. Re-run with -Apply only after reviewing the owner and principals above.'
  exit 0
}
if ($acl.Owner -ne $currentUser) {
  throw 'Refusing ACL change because the current user is not the file owner.'
}

# Defense in depth: preserve the owner’s read/write access while removing
# inherited broad access. This never reads or displays credential contents.
& icacls $file /inheritance:r /grant:r "$currentUser:(R,W)" | ForEach-Object { Write-Output $_ }
if ($LASTEXITCODE -ne 0) { throw 'Unable to harden local credential file ACL.' }
