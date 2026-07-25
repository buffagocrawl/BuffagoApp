# Retry history

1. Compared the seven supplied runs; no blind rerun.
2. Added explicit launch policy, auth-route readiness, selector contract, terminal classification, and secret-safe staged artifacts. First run `20260724T230249-2e241335` reached auth readiness but timed out before evidence of submit; root cause: Sign Up default mode was not selected to Sign In.
3. Restored the intentional stable visible-text mode-selection tap while retaining the native submit selector. Run `20260724T230849-7212c02e` stopped before credentials when a native permission dialog appeared after auth-route launch.
4. Added bounded label-specific safe prompt dismissal. Run `20260724T231428-275cb84f` stopped before credentials when the development client mounted but the auth deep-link route never rendered.

The three cycles are not equivalent retries. No fourth runtime cycle was performed.
