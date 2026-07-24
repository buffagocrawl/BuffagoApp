# Credential rotation map

## SEC-001 Google key

Purpose: native Maps plus historically unsafe client Directions use.

Required locations after owner creates properly scoped replacements:

1. Android-restricted key: EAS platform environment and ignored local env; package `com.buffago.app` plus authorized signing SHA-1.
2. iOS-restricted key: EAS platform environment and ignored local env; bundle ID `com.buffago.app`.
3. Browser key only if required: hosting environment; exact HTTPS referrers.
4. Directions server key: Supabase Edge Function/server secret, never `EXPO_PUBLIC_*`.
5. Remove compromised/shared value from EAS and local environments.

Deployment order: revoke/disable old key or establish a controlled overlap; deploy proxy/server secret; update platform builds; rebuild with cleared Metro cache; deploy; validate Maps/routes; prove old fingerprint is denied; inspect billing/usage; close alert. Rollback uses the last known restricted platform keys, never the compromised shared key.
