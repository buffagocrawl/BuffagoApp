# Live RLS results

RLS-001: **BLOCKED**. No authorized safe live Supabase session was configured. Local contract tests pass, including protected mutation and duplicate-reward assertions, but no live cross-user probe was run.

Required live probes: A/B private profile read, streak/Buffaverse modification, self-granted XP/referral reward, unauthenticated mutation, cross-user push-token exposure, social visibility, and duplicate reward insertion. Security controls were not weakened.
