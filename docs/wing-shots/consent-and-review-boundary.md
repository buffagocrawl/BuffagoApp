# Wing Shots consent and internal-review boundary

Status: implementation review complete for the submission and moderation surfaces.

## Consent findings

- Submission consent is affirmative and separate from the rating. The rating remains complete when
  media consent is declined.
- The checkbox is not preselected, and attribution has no implicit selection.
- The recorded contract includes the version, timestamp, and attribution choice. The internal queue
  displays those facts but does not reinterpret them as a transfer of ownership.
- Approved attribution choices are username, supported display name, or anonymous. A reviewer
  cannot change the contributor's selection.
- Consent covers storage, editing, cropping, resizing, branding, combination, publication, and
  promotion; restaurant/rating display; optional username display; uploader rights; people/privacy;
  and no guarantee of publication.
- Unposted withdrawal remains a user action through the server-authoritative withdrawal RPC.
  Review of an already posted item remains an operational/legal request and must not be represented
  as instant removal from third-party platforms.

## Reviewer boundary

- Queue access fails closed unless the authenticated account has an active `wing_reviewer` or
  `wing_admin` role and the moderation feature flag is enabled for that account.
- The queue returns processed-media context only. It never returns original paths, original media,
  signed URLs, raw classifier JSON, model/provider identity, or unrestricted storage metadata.
- A preview requires a single-use, requester-bound access receipt. The Edge Function validates the
  caller, consumes that receipt, and issues a protected URL for 60 seconds with `no-store`.
- AI output is advisory. Approval and rejection require a human reason and notes, and a documented
  override creates both a human moderation decision and an immutable admin/state-transition record.
- Approval text reminds reviewers that consent permits the specified BuffaGo use but does not
  transfer ownership or replace rights, privacy, minors, or personal-information review.

## Safe rejection categories

User-facing history may map the server categories to plain-language guidance without exposing model
scores or sensitive classifier details:

- `not_wings`: The upload did not clearly show wings or a related serving context.
- `unsafe_content`: The upload could not be used under the community safety policy.
- `privacy_concern`: The upload may show private information or people without clear permission.
- `duplicate`: The same or substantially similar media was already submitted.
- `spam_abuse`: The upload was associated with spam or abuse controls.
- `rights_concern`: The uploader's permission to share or license the media needs review.
- `quality_unusable`: The processed media could not meet publication requirements.
- `other_policy`: The contributor should contact support for a human-readable next step.

Reviewer notes and raw moderation explanations are never copied into user-facing rejection history.

## Remaining legal/operational dependency

Production counsel should approve the final versioned media license, takedown/copyright process,
original-media retention period, posted-content review SLA, and app-store privacy disclosures before
the publishing flags are enabled. This does not block repository implementation or dry-run review,
but it blocks representing the production legal policy as validated.
