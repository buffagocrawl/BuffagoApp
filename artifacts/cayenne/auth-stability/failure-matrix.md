# Cayenne authenticated-runtime failure matrix

The seven legacy runs did not produce a credentialed authentication request. Three were intercepted by the Expo developer menu, three raced the auth-form selector lifecycle after clean onboarding, and one began while the hierarchy was transitional. Their prior `APP_DEFECT` label was not evidence-supported; the primary categories are in `failure-matrix.csv`.

| Run | Primary classification | Terminal evidence | Confidence |
| --- | --- | --- | --- |
| 221312 | EXPO_OVERLAY | Developer menu; `auth.screen` missing | High |
| 221829 | SELECTOR_FAILURE | `auth.signin.button` missing | Medium |
| 222603 | EXPO_OVERLAY | Developer menu; `auth.screen` missing | High |
| 223150 | EXPO_OVERLAY | Developer menu; `auth.screen` missing | High |
| 223749 | SELECTOR_FAILURE | `auth.password.input` missing | Medium |
| 224359 | SELECTOR_FAILURE | `auth.signin.button` missing | Medium |
| 225002 | APP_NOT_READY | `app.root` missing | High |

No legacy run establishes email input, password input, submit delivery, network request, Supabase response, or an authenticated shell.
