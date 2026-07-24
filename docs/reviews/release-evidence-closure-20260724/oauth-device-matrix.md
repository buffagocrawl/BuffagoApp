# OAuth Device Matrix

| Flow | Android | iOS | Result |
|---|---|---|---|
| Google success/cancel/failure/expiry | Not run; no device/credentials | Not run; no macOS/toolchain/credentials | Blocked evidence |
| Background/termination during OAuth | Not run | Not run | Blocked evidence |
| New/existing routing and referral retention | Contract/source only | Contract/source only | Not release-validated |
| Sign-out/different account/provider display | Contract/source only | Contract/source only | Not release-validated |
| Deleted-account behavior | Contract/source only | Contract/source only | Not release-validated |
| Facebook | Provider state not live-verified; interface/code path exists | Same | Not release-validated |

No black-screen, stale-route, or wrong-auth-state claim is made because no supported real session was available.
