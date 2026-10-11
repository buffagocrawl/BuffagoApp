# Wing Shot eligibility SQL release record

The owner reports this SQL was manually deployed through Supabase SQL Editor and independently verified. Its migration-ledger entry is missing. [Exact SQL record](android-qa-rating-photo-proposed.sql.txt) is retained for provenance and isolated local regression testing; the legacy filename reflects its original proposal status. Do not replay it, repair migration history or run db push during this release.

Only two exclusions change:

1. `wing_shot_rating_is_eligible(uuid, uuid)` removes `and not coalesce(rating.is_buffacoin, false)`.
2. `wing_shot_rating_eligibility_reason(uuid, uuid, uuid)` removes the conditional returning `buffacoin_rating`.

Ownership, destination matching, complete scores, duplicate reservation/submission checks, feature flags, private storage, consent, moderation, privileges and function security settings remain. No coin transaction, balance, schema or Edge Function changes are part of this SQL record.

Canonical coin and Wingman ratings reuse WingShotFlow and private staging. Attachment waits for the committed rating receipt. Photo retries retain the rating/operation IDs and upload session and never call the coin transaction again. Existing Journey uses the same eligibility RPC. Guest onboarding's unpersisted quick-score preview has no canonical rating ID and remains unchanged.

No production query, SQL execution or deployment was performed in the final cleanup.