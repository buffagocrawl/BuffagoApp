# Security Notes

Values prefixed with `EXPO_PUBLIC_` are bundled into the mobile app and must be treated as public. Do not put private API keys, admin tokens, Stripe secrets, OpenAI keys, or unrestricted server keys in `EXPO_PUBLIC_` variables or frontend code.

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` may be used by the app. The anon key is safe only when Supabase Row Level Security policies protect the underlying data.

`OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must live only in backend environments such as Supabase Edge Function secrets. Mobile app code must call Edge Functions for privileged work instead of calling OpenAI or using service role credentials directly.

`EXPO_PUBLIC_GOOGLE_API_KEY` must be a mobile/client Google key restricted in Google Cloud to the intended APIs, app package names, bundle IDs, and signing fingerprints.
