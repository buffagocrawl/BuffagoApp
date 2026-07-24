param([string]$DeviceId='emulator-5554',[switch]$StopEmulator)
if($StopEmulator){& adb -s $DeviceId emu kill 2>$null}; Write-Output "Runtime cleanup complete for $DeviceId"
