[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$crawl = Join-Path $root 'crawl'
$envFile = Join-Path $crawl '.env.development'
$gradle = Join-Path $crawl 'android\gradlew.bat'
$apk = Join-Path $crawl 'android\app\build\outputs\apk\release\app-release.apk'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'CAYENNE_RELEASE_E2E_BLOCKED: development public-client configuration is absent.' }
if (-not (Test-Path -LiteralPath $gradle -PathType Leaf)) { throw 'CAYENNE_RELEASE_E2E_BLOCKED: Android Gradle wrapper is absent.' }

# Expo reads EXPO_PUBLIC values at bundle time. Keep them only in this build
# process; this script never echoes values or writes an environment dump.
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    $name = $matches[1]
    $value = $matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
    Set-Item -Path ("Env:" + $name) -Value $value
  }
}
$env:EXPO_PUBLIC_CAYENNE_E2E = 'true'
$env:NODE_ENV = 'production'

Push-Location (Join-Path $crawl 'android')
try {
  # This artifact targets the configured x86_64 Cayenne emulator only.  It
  # avoids unrelated ABI-native work and the Windows file-lock races it causes.
  & $gradle assembleRelease --no-daemon --no-parallel --max-workers=1 -PreactNativeArchitectures=x86_64
  if ($LASTEXITCODE -ne 0) { throw "CAYENNE_RELEASE_E2E_BUILD_FAILED: Gradle exited $LASTEXITCODE." }
} finally { Pop-Location }

if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw 'CAYENNE_RELEASE_E2E_BUILD_FAILED: expected APK is absent.' }
$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output (ConvertTo-Json @{ status = 'BUILT'; apk = 'crawl/android/app/build/outputs/apk/release/app-release.apk'; sha256 = $hash } -Compress)
