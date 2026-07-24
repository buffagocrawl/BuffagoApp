# Environment Preflight

| Check | Result |
|---|---|
| Target environment | No safe live validation environment authorized or configured; repository/local evidence only |
| Supabase URL/read key | Not available as process credentials; no remote schema query |
| Google OAuth test credentials | Not available |
| Facebook OAuth state | Code path exists; provider credentials/status not available for live test |
| Expo project identity | Configured project ID present in app config; Expo token not available |
| Android identity | `com.buffago.app` |
| iOS bundle identity | `com.buffago.app` |
| APNs/FCM credentials | Not available |
| Deep link | `buffago://auth/callback`, `buffago://auth/reset`, `https://buffago.com/r` configured |
| Referral flag | Default-off in example/config evidence |
| Notification dispatcher | Supabase function present; provider delivery unverified |
| Remote schema/RLS | Unknown; no migration applied |
| Android hardware | `adb devices -l`: no devices attached |
| iOS hardware/toolchain | `xcrun` unavailable on Windows |

Secrets, tokens, passwords, and push tokens were not recorded. No destructive workflow was run.
