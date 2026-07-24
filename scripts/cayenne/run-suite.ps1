param([Parameter(Mandatory=$true)][ValidateSet('smoke','smoke-auto','smoke-clean','smoke-authenticated','auth','onboarding','full')][string]$Suite,[ValidateSet('local-mock','qa','production-readonly')][string]$Environment='production-readonly',[switch]$SerranoReview)
& (Join-Path $PSScriptRoot 'run.ps1') -Suite $Suite -Environment $Environment -SerranoReview:$SerranoReview
