# Cayenne secure Android authentication

Run the permanent QA-account lifecycle only from a local shell. The harness reads
`CAYENNE_TEST_EMAIL` and `CAYENNE_TEST_PASSWORD` at runtime; it never reads a
password from a tracked file or Maestro flow.

```powershell
Set-Location C:\Users\Brand\repo\BuffagoApp
.\scripts\cayenne\run-secure-auth.ps1 -DeviceId emulator-5554
```

The helper prompts securely for the password, starts the `auth` suite, and clears
both variables afterwards. It does not write credentials to disk or pass them on
the command line. For an already provisioned controlled process, run:

```powershell
.\scripts\cayenne\run.ps1 -Suite auth -Environment qa -DeviceId emulator-5554 -ResetApp
```

If either required variable is absent or a placeholder is supplied, the run stops
with `CAYENNE_AUTH_BLOCKED: Required Cayenne authentication environment variables are not configured.`
No value is included in that error or generated report.

The auth suite clears app data, signs in, verifies the authenticated marker and a
profile RLS-backed read, relaunches to verify session restoration, and signs out.
Maestro automatic artifacts are held in a temporary directory for this suite; no
screenshot is persisted during password entry. Generated session and local secret
paths are Git-ignored.
