param([string]$DeviceId='emulator-5554')
& adb -s $DeviceId get-state; & adb -s $DeviceId shell getprop ro.build.version.sdk; & adb -s $DeviceId shell pm list packages com.buffago.app
