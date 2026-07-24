param([switch]$SerranoReview,[switch]$DryRun)
& (Join-Path $PSScriptRoot 'run.ps1') -Suite smoke -Environment production-readonly -SerranoReview:$SerranoReview -DryRun:$DryRun
