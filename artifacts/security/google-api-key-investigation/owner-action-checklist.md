# Owner Action Checklist

- [ ] Immediately disable or rotate key `AIza...j-Ck`.
- [ ] Review Google Maps Platform usage, requests by API/credential, billing, and
  anomalies from 2026-07-24 onward (and earlier if the same key predates Git).
- [ ] Create distinct development/staging/production keys and distinct keys for
  each application restriction type.
- [ ] Restrict the Android Maps SDK key to package `com.buffago.app` and every
  authorized release/debug SHA-1 certificate fingerprint.
- [ ] Restrict the iOS Maps SDK key to bundle ID `com.buffago.app`.
- [ ] If web Maps functionality needs a browser key, restrict it to exact
  `buffago.com` HTTPS referrers and explicitly required preview/localhost origins.
- [ ] Restrict each key to only its required APIs: likely Maps SDK for Android,
  Maps SDK for iOS, and Directions API (Legacy) pending architecture change.
- [ ] Move Directions web-service calls behind an authenticated Supabase Edge
  Function/server proxy. Do not expose its server key through `EXPO_PUBLIC_*`.
- [ ] If direct mobile Directions calls are temporarily retained, implement the
  documented platform headers and prove invalid identifiers are rejected; do
  not treat this as verified until tested.
- [ ] Apply conservative per-minute/per-day quotas and billing budget alerts.
- [ ] Put replacement client keys into the correct EAS environments and ignored
  local environment files. Put server keys only in Supabase Edge Function
  secrets/server environments.
- [ ] Remove the old EAS production PUBLIC variable value and configure the
  replacement architecture; do not reuse the compromised value.
- [ ] Rebuild Android, iOS, and web; redeploy; validate Maps, walking routes, and
  Supabase/Google authentication.
- [ ] Confirm the old key returns denial/invalid-key responses without using it
  in repository tests or logs.
- [ ] Run `npm run security:scan`, CI, and GitHub secret scanning.
- [ ] Decide whether to execute the separate history cleanup plan.
- [ ] Close GitHub alert #1 only after revocation, replacement, restriction
  verification, rebuild, redeploy, and scans.
- [ ] Rotate any additional local credential that may have been exposed outside
  Git even though none was found tracked here.
