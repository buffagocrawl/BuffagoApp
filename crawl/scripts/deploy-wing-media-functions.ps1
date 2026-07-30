param(
  [string]$ProjectRef = 'vhfxnizaxdanmvmouuaf'
)

$ErrorActionPreference = 'Stop'
$functions = @(
  'wing-media-stage-authorize',
  'wing-media-validate',
  'wing-media-promote',
  'wing-media-staging-cleanup',
  'wing-media-staging-gc'
)

foreach ($functionName in $functions) {
  supabase functions deploy $functionName --project-ref $ProjectRef --use-api --yes
}
