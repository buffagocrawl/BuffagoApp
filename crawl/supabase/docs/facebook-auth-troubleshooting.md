# Facebook OAuth troubleshooting

## Expected sequence

For sign-in:

1. `facebook_button_tapped` with `mode=sign_in`
2. `facebook_oauth_request_started`
3. `facebook_oauth_request_succeeded` with a sanitized Facebook provider URL
4. `facebook_browser_session_opening`
5. Facebook returns through Supabase to `buffago://auth/callback`
6. `facebook_redirect_deep_link_received` and/or `oauth_deep_link_received_at_root`
7. `oauth_callback_screen_started`
8. `oauth_callback_params_inspected`
9. Code exchange or token session setup succeeds
10. `oauth_session_persisted` and `oauth_user_refresh_finished`
11. Facebook profile/social-link persistence succeeds
12. `facebook_flow_finished` with `outcome=success`

For account linking, steps 1-8 are the same with `mode=link_identity`. A link callback
does not have to contain a new login code or token pair. BuffaGo keeps the existing
session, refreshes the user, verifies the Facebook identity, persists the social link,
and then records success.

Every event includes a `flowId` and elapsed timing where available. URLs are reduced to
safe structural details, and tokens, codes, secrets, authorization values, and OAuth
state are redacted by the debug logger.

## June 23, 2026 debug dump

The provided dump shows the account-linking flow reached Facebook:

- `facebook_connect_button_tapped`
- `facebook_oauth_surface_selected`
- `facebook_oauth_url_opened`
  - host: `www.facebook.com`
  - path: `/dialog/oauth`
  - redirect scheme: `buffago`
- about 6 seconds later, `facebook_oauth_webbrowser_result`
  - type: `dismiss`
  - no result URL
  - no observed redirect
- `facebook_oauth_no_redirect`
- `facebook_oauth_cancelled`

No callback, session, identity, profile-update, or success event followed. The existing
user and profile remained disconnected.

The Android manifest does contain a browsable `buffago` scheme intent filter and uses a
`singleTask` main activity. Supabase also produced a provider URL containing the native
redirect scheme. This rules out a completely missing Android scheme registration.

## What changed

- Added a shared Facebook OAuth runner for sign-in and account linking.
- Added a reachable Facebook sign-in button on the login screen.
- Stored flow mode, return path, expected link user, flow ID, and start time before
  opening the browser.
- Kept a dedicated Android deep-link listener alive for a short grace period after a
  Custom Tab reports `dismiss`. This handles Expo's Android race where app activation
  can arrive before the deep-link event.
- Added a root-level callback listener so warm and cold deep links are cached even if
  the initiating screen is unmounted.
- Changed account-link callback handling to reuse and refresh the existing Supabase
  session when no new code/token pair is returned.
- Added explicit provider-error parsing and Facebook identity verification.
- Added sanitized logging for request, browser handoff, callback parameters, session,
  user refresh, profile persistence, timing, errors, and final outcome.
- Added recursive debug-log sanitization so sensitive OAuth fields are never stored.

## Dashboard checks if it still fails

Supabase:

- Authentication > Providers > Facebook is enabled.
- Facebook App ID and App Secret belong to the same Facebook app and environment.
- Authentication > URL Configuration allows `buffago://auth/callback`.
- Manual identity linking is enabled if the Supabase project exposes that setting.
- Supabase Auth logs show the `/user/identities/authorize` request and its provider
  callback result.

Facebook:

- Facebook Login is added to the app.
- Valid OAuth Redirect URIs contains exactly:
  `https://vhfxnizaxdanmvmouuaf.supabase.co/auth/v1/callback`
- Client OAuth Login and Web OAuth Login are enabled.
- The app is Live, or the testing Facebook account has an app role.
- The app's required data-use/privacy settings are complete.
- If Facebook displays an error before returning to BuffaGo, capture the visible error
  text and correlate it with the new `flowId`.

The flow uses Supabase browser OAuth through Android Custom Tabs, not the native
Facebook SDK. Android Facebook key hashes and a Facebook SDK package configuration are
therefore not required for this implementation.
