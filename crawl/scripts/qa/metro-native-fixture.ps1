$env:BUFFAGO_NATIVE_VISUAL_QA = '1'
$env:EXPO_PUBLIC_BUFFAGO_NATIVE_RADIUS_QA = '1'
$env:EXPO_PUBLIC_BUFFAGO_NATIVE_GALLERY_QA = '1'
$env:NODE_ENV = 'development'
Remove-Item Env:CI -ErrorAction SilentlyContinue
Set-Location 'C:\Users\Brand\repo\BuffagoApp\crawl'
& node node_modules\expo\bin\cli start --dev-client --port 8083 --max-workers 2 --clear

