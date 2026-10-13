$ErrorActionPreference = 'Stop'
$qaRoot = (Resolve-Path "$PSScriptRoot/../../../../").Path
$qaOutput = Join-Path $qaRoot 'artifacts/app-polish/release-qa/android-pinch'
$qaJava = 'C:/Program Files/Android/Android Studio/jbr/bin'
$qaSdk = "$env:LOCALAPPDATA/Android/Sdk"
$qaBuild = "$qaSdk/build-tools/36.0.0"
$qaPlatform = "$qaSdk/platforms/android-36/android.jar"
New-Item -ItemType Directory -Force "$qaOutput/classes", "$qaOutput/dex" | Out-Null
& "$qaJava/javac.exe" --release 8 -cp $qaPlatform -d "$qaOutput/classes" "$PSScriptRoot/PinchInstrumentation.java"
if ($LASTEXITCODE) { throw 'Instrumentation compilation failed' }
& "$qaBuild/d8.bat" --min-api 26 --lib $qaPlatform --output "$qaOutput/dex" "$qaOutput/classes/com/buffago/polishqa/PinchInstrumentation.class"
if ($LASTEXITCODE) { throw 'Dex compilation failed' }
& "$qaBuild/aapt.exe" package -f -M "$PSScriptRoot/AndroidManifest.xml" -I $qaPlatform -F "$qaOutput/unsigned.apk"
if ($LASTEXITCODE) { throw 'APK packaging failed' }
Push-Location "$qaOutput/dex"
try { & "$qaBuild/aapt.exe" add "$qaOutput/unsigned.apk" classes.dex } finally { Pop-Location }
if ($LASTEXITCODE) { throw 'Dex packaging failed' }
& "$qaBuild/apksigner.bat" sign --ks "$qaRoot/crawl/android/app/debug.keystore" --ks-pass pass:android --out "$qaOutput/pinch-qa.apk" "$qaOutput/unsigned.apk"
if ($LASTEXITCODE) { throw 'Debug signing failed' }
Write-Output "Built local test harness: $qaOutput/pinch-qa.apk"
