# Wing Shot imported-media transport

The four mobile-facing staging functions use `verify_jwt = false` in
`supabase/config.toml` because the app must receive the handler's controlled
authentication response during Supabase JWT gateway/key transitions. This does
not make them public: every request forwards its `Authorization` bearer to a
Supabase client and requires `auth.getUser()` to return a user.

The authorization function creates signed upload URLs only for
`<authenticated-user-id>/<correlation-uuid>/<safe-file-name>` in the private
`wing-shot-staging` bucket. Validation, promotion, and cleanup require the
same user-owned path shape; promotion additionally checks the caller owns the
submission record. The GC function is service-to-service only and requires its
Vault-managed secret header.

The mobile client uses `functions.invoke`, which supplies the current session
bearer and publishable/anon key. It logs only token presence and shape, never a
token. A 401/403 authentication failure causes one `refreshSession()` attempt
and one retry. Authorization happens before the signed upload, so a refresh
retry cannot duplicate an upload; the staged session is reused for validator
and promotion retries.

Safe evidence is correlated with `x-wing-correlation-id` across authorization,
staging upload, validation, promotion, and cleanup. Logs contain stage, status,
reason code, media metadata, and dispatch state, but no access tokens, signed
URLs, or secret keys.
