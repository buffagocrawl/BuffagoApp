param([string]$DeviceId='emulator-5554')
& adb -s $DeviceId shell pm clear com.buffago.app
