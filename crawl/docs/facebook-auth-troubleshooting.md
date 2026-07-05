# Facebook Auth Troubleshooting

Facebook sign-in and account linking use Supabase OAuth in a browser auth session.
The app scheme is `buffago`, and the expected app callback is:

```text
buffago://auth/callback
```

## Where Logs Appear

Runtime logs are written to:

- Device console with `[facebook] ...` messages.
- Supabase `debug_logs` rows where `scope = 'facebook'`.
- Analytics `user_events` for high-level events such as success, failure, and cancellation.

The log payloads intentionally redact tokens, auth codes, OAuth state, secrets, JWTs,
API keys, and nested URL credentials. Callback credentials are logged only as
presence, length, and short prefix/suffix summaries.

## Successful Flow

A successful Facebook sign-in or link should look like:

1. `facebook_link_start`
2. `facebook_button_tapped`
3. `facebook_oauth_request_started`
4. `facebook_oauth_request_succeeded`
5. `facebook_browser_session_selected`
6. `facebook_link_browser_opened`
7. `facebook_link_callback_received` or `oauth_deep_link_received_at_root`
8. `oauth_callback_params_inspected` with `hasCode=true` or both token flags true
9. `oauth_code_exchange_succeeded` or `oauth_set_session_succeeded`
10. `oauth_session_persisted`
11. `facebook_oauth_success` / `facebook_link_success`
12. `facebook_flow_finished` with `outcome="success"`

## Common Failure Signatures

- `facebook_browser_session_result` has `type="dismiss"` and `hasUrl=false`:
  the browser session closed without a callback. Verify the Facebook dialog was
  not manually closed, the Facebook app is live or the tester is authorized, and
  the provider settings below are correct.

- `oauth_callback_url_missing`:
  the app navigated to the callback screen but did not receive or cache a callback
  URL. Verify the Android intent filter and iOS scheme for `buffago://auth/callback`.

- `oauth_callback_params_inspected` has `hasCode=false`, `hasAccessToken=false`,
  and `hasRefreshToken=false`:
  the app received a callback, but Supabase did not return a usable auth code or
  token pair. Check Supabase redirect allow list and provider configuration.

- `oauth_code_exchange_started` followed by `facebook_link_failure`:
  Supabase rejected the returned code. Check for expired/reused codes, project URL
  mismatch, or provider credential mismatch.

- `facebook_identity_missing_after_callback`:
  a session exists, but Supabase did not attach a Facebook identity. Verify the
  flow mode and provider in Supabase Auth.

## Settings To Verify

- Expo/app scheme: `scheme: "buffago"` in `app.config.js`.
- Android package: `com.buffago.app`.
- Android intent filter includes `buffago://auth/callback`.
- Supabase Auth URL allow list includes exactly `buffago://auth/callback`.
- Supabase Facebook provider is enabled with the current Facebook App ID and App Secret.
- Facebook Developer Console Valid OAuth Redirect URI includes:

```text
https://vhfxnizaxdanmvmouuaf.supabase.co/auth/v1/callback
```

- Production builds should use `EXPO_PUBLIC_SUPABASE_URL=https://vhfxnizaxdanmvmouuaf.supabase.co`.
