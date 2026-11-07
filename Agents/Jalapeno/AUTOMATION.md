# Jalapeno automation operations

Publishing and Metrics remain the existing GitHub workflows. The Pi component only dispatches fixed workflows on main with a dated input; it has no Meta, Supabase, source or ledger credentials. Its credential must be a fine-grained PAT limited to BuffagoApp with Actions read/write and default metadata access. The existing broad repo/workflow credential must never be copied to Pi.

## Authority and activation

`JALAPENO_SCHEDULER` defaults to `github`. With `pi`, GitHub scheduled publishing/collection attempts become explicitly inactive; manual work remains available. A dated publishing dispatch is admitted only for its exact America/New_York date, at 19:30 through strictly before 21:00. The existing private daily/platform claims, immutable revisions, screening, account validation, reconciliation and main-workflow identity remain mandatory. A completed daily ledger is reported as duplicate_complete without requesting another provider publication.

Verify hostname buffago-growth, machine ID and access. Install automation_scheduler.py into `/opt/buffago-jalapeno-scheduler/` and the two systemd units. Store only the scoped dispatch token at `/etc/buffago-jalapeno-dispatch-token`, root:branden mode 0640. Run the script with `--check` for GET-only workflow/credential checks. Do not use an actual publish as a test. A read-only health workflow dispatch may verify Actions write access without publication.

Only after the scoped credential is verified, set the repository variable JALAPENO_SCHEDULER=pi, then enable/start buffago-jalapeno-scheduler.timer. Without that credential, leave the timer disabled and authority at github; publishing reliability remains blocked, not repaired. To roll back, disable the Pi timer before restoring github authority. Do not leave competing publication schedulers enabled.

## Calendar

### Community spotlight

`COMMUNITY_SPOTLIGHT_SCHEDULER` defaults to `github`. Set it to `pi` after
verifying the installed dispatcher and existing scoped credential. This makes
GitHub scheduled **publishing** inactive; scheduled health, manual plan/health,
and manual publication remain available. Keep `COMMUNITY_SPOTLIGHT_ENABLED=true`.
The Pi dispatches `community-spotlight.yml` on main at 12:00, 12:20 and 12:40
America/New_York on Monday, Wednesday, Friday, Saturday and Sunday, plus read-only
health at 13:05 on those days. Dated dispatches require Pi ownership and the
current Eastern date. Existing noon gates, original run identity, daily claims,
three-attempt recovery bound, consent, scores, verified mentions and 30-day
photo/location cooldowns remain enforced. No catch-up or extended hours.

Durable filenames and records include workflow identity. Legacy unqualified
records still suppress their original evening slots during an upgrade, but
cannot suppress spotlight. Each slot writes intent before HTTP, including an
fsync; uncertain responses and interrupted attempts are not resent that slot.
Later bounded slots rely on the workflow's existing daily ledger for recovery.
`--check` checks all three active workflow identities with GET only. A successful
dispatch proves acceptance by GitHub, not execution or Instagram publication.

Deploy only after verifying hostname `buffago-growth`; back up and replace only
the dispatcher and its dedicated units, retaining the protected token and state.
Run Python compilation, systemd unit/calendar validation and GET-only `--check`,
then set spotlight ownership to Pi and reload/restart the dedicated timer.
Verify installed hashes, enabled/active state and next Eastern slots. Validate
Actions write permission with a `mode=health` dispatch using the existing Pi
credential, never a test publication. Preserve dashboard units/settings.
To roll spotlight scheduling back, remove its two Pi timer calendars before
restoring `COMMUNITY_SPOTLIGHT_SCHEDULER=github`; retain all evening calendars.

The native timer uses America/New_York, independently of the Pi OS default timezone. Publication slots: 19:30, 19:50, 20:10, 20:30, 20:50. Metrics slots: 20:30 and 21:10. Read-only daily ledger health: 21:15 and 21:45. Persistent=false prevents boot-time catch-up. The service exits outside exact slots and never polls continuously. A durable intent is written before each HTTP dispatch. An ambiguous response is never retried in the same slot; a subsequent slot can recover through the existing ledger. An accepted dispatch is not evidence of publication. GitHub runner availability can still delay execution past the strict 21:00 cutoff.

The Pi token has no publication credentials. The stock workflows validate the scheduler authority/date again; publication cannot be shifted to another date by a delayed workflow. Existing manual publish keeps its 18:00-21:00 window; local plan/preview and isolated live tests remain separate.

## Health and monitoring

A skipped attempt is never treated as proof of a missed day. The read-only health job reads the current daily ledger and both platform statuses after the deadline. It distinguishes disabled, window-not-closed, complete, partial, unconfirmed (pending provider reconciliation), source-blocked and genuinely missed days. It cannot claim, mutate the ledger, upload or call Meta. Actionable failures use Actions error annotations, failed job status and step summaries. Existing late/inactive GitHub triggers can run this ledger audit even when Pi is the publication authority; they cannot compete to publish.

Pi dispatch failures are visible in systemd service status/journald without response bodies or credentials. A missing/expired token is a real dispatch blocker. Health checks still fail accurately when the ledger lacks a completed day; an expected inactive DST trigger does not itself constitute failure.

## Metrics

The obsolete publishing cron assertion now checks the shared clock contract and enable/main/concurrency/privacy controls. Relevant PR checks run the five publishing/analytics/diagnostic suites together. Synthetic FFmpeg/ffprobe and Tesseract integration run in CI without real credentials or media.

Metrics reports new successful observation count and latest actual capture time separately from report/feed generation time. Historical snapshots remain immutable. Current observations append under new run identities; last-good values and original capture times are retained after failed reads. Null, explicit zero, unsupported metrics and permission gaps remain distinct. A no-observation collection for existing posts fails visibly while its safe last-good/gap report can still reach the feed. Skipped scheduled collection does not run that workflow's feed step. The separate dashboard aggregate workflow and Pi ten-minute feed pull are unchanged.

## Investigation (November 1, 2026)

The October 31 and November 1 publishing examples were created and started at the same late instants, with gate jobs starting within seconds. Their provider jobs were never reached. This supports late schedule delivery rather than long runner queueing or provider rejection as the cause of those skips. The private daily ledger independently had no daily platform records for October 30 or 31. Metrics run 41286541028 failed its obsolete cron assertion before collection; its late 02:53 EST creation would also have been outside its intended evening collection time. More cron slots alone do not establish reliable delivery.

No consumer tables, data, source records, production database functions, Meta permissions, retired publisher or unrelated agents are changed. Operational verification must separately record tests, deployment, analytics captures and actual publication evidence. Until a real automatic evening run posts, publication verification remains pending.
The same nine UTC trigger slots are listed individually only so a deliberately inactive DST slot can be distinguished from a delayed eligible slot. This does not improve GitHub delivery reliability or add eligible attempts. The combined recovery expression and legacy expected slots remain accepted for already queued executions. Tests share the supported cron contract rather than hard-coding a previous workflow layout.
