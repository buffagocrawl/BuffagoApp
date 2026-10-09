# Buffago Growth Command Center redesign

Implemented locally. The mobile app was not edited. No Supabase migration, Pi update, or deployment was performed.

## Snapshot contract

Production already has migration `20261008121036_product_pulse_operations` applied. The new, unapplied follow-up is `supabase/migrations/20261008130000_growth_command_center_redesign.sql`.

The follow-up adds these fields while retaining all existing snapshot keys:

```text
product_pulse.device_opens.{all_time,last_24h,previous_24h}.{total,ios,android}
product_pulse.calendar_mau.{previous_month,current_month}.{month,value}
product_pulse.totals.{wing_ratings,restaurants,accounts}
product_pulse.monthly_history[].{month,mau,unique_devices,wing_ratings,new_accounts,app_open_tracking_available}
product_pulse.open_work.total
marketing.{score,score_version,confidence,explanation,factors}
```

The deployed `buffago_product_pulse_operations()` helper remains intact and continues to provide the existing pending-photo count. The follow-up merges a second helper into `product_pulse`, overriding device opens with mobile-only counts and adding calendar MAU, totals, monthly history, open work, and Marketing Score. It patches the existing snapshot RPC definition while preserving `SECURITY DEFINER`, owner, grants, Growth OS behavior, and legacy snapshot fields. New helpers use an empty fixed search path and are executable by `service_role` only.

The earlier local file `supabase/migrations/20261008030949_product_pulse_operations.sql` is untracked and does not match the production ledger version. Its prior contents were not recoverable from local version control, so it was left untouched; it was not used as the new deployment unit.

The active `buffago-growth-snapshot` Edge Function was inspected at version 4. It returns `{ ...snapshotResult.data, growth_os, auth_mode }`, so the new top-level and Product Pulse fields pass through without an Edge Function change or deployment.

The wall uses one existing device-authenticated snapshot request. Store ingestion, `buffago_store_metrics_daily`, and prior store fields remain in place; unconnected store cards were removed from the main wall.

## Marketing Score v1

For each factor, split its available trailing calendar-month observations into an older half and newer half. App-open factors skip months before telemetry began. Within each half, weight a month at index `i` from oldest (`0`) to newest (`11`) by `w(i) = 1 + i/11`, then calculate its weighted average `R` or `P`.

```text
factor = round_half_up(50 + 50 * clamp((R - P) / (P + 5), -1, 1))
score  = round_half_up(sum(factor * weight) / sum(available weights))
```

The weights are MAU momentum `0.40`, unique mobile-device acquisition `0.25`, wing-rating activity `0.20`, and new-account growth `0.15`. If a factor lacks enough observations, it is omitted and the remaining weights are renormalized. The `+5` pseudocount and `[-1, 1]` cap limit small-sample swings. The Python model and SQL snapshot function implement the same deterministic formula. Confidence is limited below 6 tracked app-open months, medium at 6–8, and high at 9 or more. Explanations name the dominant stronger/weaker factors and append the tracking coverage when confidence is limited.

Read-only production monthly history currently has five tracked app-open months, June through October 2026. The calculated live score is **18 / 100**, confidence **limited**, with factors MAU **15**, acquisition **14**, engagement **22**, and account growth **28**. Its explanation is: “Growth momentum is soft, led by weakness in device acquisition. App-open tracking covers 5 months, so score confidence is limited.”

## Read-only live values

Queried the active Buffago Supabase project on 2026-10-08. These are query results, not application constants:

| Metric | Value |
| --- | ---: |
| Existing all-platform snapshot total | 92 |
| Unique mobile devices, all time | 91 |
| iOS / Android | 11 / 80 |
| Unique mobile devices, last 24 hours | 10 |
| iOS / Android, last 24 hours | 0 / 10 |
| September calendar MAU | 4 |
| October calendar MTD MAU | 12 |
| Total wing ratings / restaurants / accounts | 312 / 707 / 46 |
| Pending photos | 2 |
| Open work | 0 |

The old 92 total includes 80 Android IDs, 11 iOS IDs, and one Web ID. Filtering to the mobile platforms leaves **91 = 11 + 80**. Web events remain untouched in Supabase. The old deployed rolling-24-hour total is 11 because it also includes one Web ID; mobile-only is 10.

The active Growth OS experiment is **MAU Growth Sprint #1**, metric `mau_30d`, current **16 / 10**, ending October 20. Its 30-day MAU definition remains separate from calendar MAU. Today's Move is absent, so the wall derives the next step from the lowest score factor without creating a database record. The current marketing insight expires October 21 and remains active at query time.

## Visual evidence

Screenshots use the synthetic demo snapshot so no personal records appear in the artifacts:

- `artifacts/redesign/buffago-growth-800x480.png`
- `artifacts/redesign/buffago-growth-1280x720.png`
- `artifacts/redesign/buffago-growth-1600x900.png`

All three captures were inspected. The title anchor is at the exact display midpoint, the logo and mascot stay inside the header, all four charts and both action cards fit, and no canvas item extends beyond the tested viewport. The 800×480 layout keeps four compact charts in one row, which fit at the target size.

## Checks

- Python suite: **79 tests passed**, including snapshot resilience, score formula/confidence, alert states, Growth Engine empty/active states, branding, kiosk behavior, and real Tk captures at all three sizes.
- JavaScript/PostgreSQL migration regression: **1 test passed** using PGlite and the deployed RPC fixture. It upgrades the existing legacy helper, checks repeated IDs, cross-platform IDs, web/null/unknown/other exclusions, 24-hour edges, New York month boundaries, 12 monthly slots, tracked null versus zero, totals, photo statuses, open-work sum, score weights, migration reapplication, and the snapshot owner's security mode and grants.
- `node --check control_web/control.js`: passed.
- `python -m compileall -q .`: passed.
- `git diff --check`: passed (Git printed line-ending normalization notices for existing workspace files).

No physical Raspberry Pi was available. Fullscreen and keyboard kiosk behavior remain covered by the existing Python tests; the minimum window size now supports 800×480.

## Raspberry Pi update

Apply `20261008130000_growth_command_center_redesign.sql` through the existing controlled Supabase migration process before replacing the Pi files. This follow-up has not been applied. The Edge Function does not need deployment. Copy these runtime files:

```text
app.py
models.py
ui/dashboard.py
ui/theme.py
ui/components.py
assets/icon.png
assets/wing-user.png
```

From PowerShell at the repository root, stage and install them with the existing `branden` Pi account:

```powershell
$pi = 'branden@buffago-growth.local'
ssh $pi 'mkdir -p /tmp/buffago-growth-update/ui /tmp/buffago-growth-update/assets'
scp .\buffago-growth-command-center\app.py .\buffago-growth-command-center\models.py ${pi}:/tmp/buffago-growth-update/
scp .\buffago-growth-command-center\ui\dashboard.py .\buffago-growth-command-center\ui\theme.py .\buffago-growth-command-center\ui\components.py ${pi}:/tmp/buffago-growth-update/ui/
scp .\buffago-growth-command-center\assets\icon.png .\buffago-growth-command-center\assets\wing-user.png ${pi}:/tmp/buffago-growth-update/assets/
ssh $pi 'sudo install -m 644 /tmp/buffago-growth-update/app.py /opt/buffago-growth-command-center/app.py && sudo install -m 644 /tmp/buffago-growth-update/models.py /opt/buffago-growth-command-center/models.py && sudo install -m 644 /tmp/buffago-growth-update/ui/dashboard.py /opt/buffago-growth-command-center/ui/dashboard.py && sudo install -m 644 /tmp/buffago-growth-update/ui/theme.py /opt/buffago-growth-command-center/ui/theme.py && sudo install -m 644 /tmp/buffago-growth-update/ui/components.py /opt/buffago-growth-command-center/ui/components.py && sudo install -D -m 644 /tmp/buffago-growth-update/assets/icon.png /opt/buffago-growth-command-center/assets/icon.png && sudo install -D -m 644 /tmp/buffago-growth-update/assets/wing-user.png /opt/buffago-growth-command-center/assets/wing-user.png && sudo systemctl restart buffago-growth.service'
```

The staged demo JSON is not needed in live mode. No dependency installation is required.
