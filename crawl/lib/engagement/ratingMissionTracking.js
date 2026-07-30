import { normalizeTimeZone } from './retentionDomain.js';
import { recordQualifyingAction } from './retentionService.js';

export const RATING_CREATED_ACTION = 'rating_created';

export function resolvedDeviceTimezone() {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return 'UTC';
  }
}

function safeErrorCategory(error) {
  const code = String(error?.code || error?.cause?.code || '').toLowerCase();
  if (code === '42501' || code.includes('auth')) return 'authentication_failed';
  if (code === 'network' || code === 'fetch_failed' || code.includes('timeout')) return 'network_failed';
  return 'backend_unavailable';
}

// A saved rating is authoritative even when engagement is temporarily down.
// The RPC owns idempotency, so replaying a committed rating is safe.
export async function recordSavedRatingMission({
  supabase,
  userId,
  submittedRatingId,
  timezone = resolvedDeviceTimezone(),
  refreshMissionSummary,
  onDiagnostic,
}) {
  if (!userId || !submittedRatingId) return { recorded: false, skipped: true };

  try {
    await recordQualifyingAction(supabase, {
      actionType: RATING_CREATED_ACTION,
      actionRef: submittedRatingId,
      timezone: normalizeTimeZone(timezone),
    });
    // Refresh is deliberately after the RPC: presentation cannot substitute
    // for the receipt that makes mission progress authoritative.
    if (refreshMissionSummary) await refreshMissionSummary();
    return { recorded: true, skipped: false };
  } catch (error) {
    const diagnostic = {
      event: 'qualifying_action_failed',
      ratingIdPresent: Boolean(submittedRatingId),
      actionType: RATING_CREATED_ACTION,
      category: safeErrorCategory(error),
    };
    console.warn('[weekly-mission] qualifying_action_failed', diagnostic);
    try {
      await onDiagnostic?.(diagnostic);
    } catch {
      // Diagnostics are secondary too; never expose an analytics failure.
    }
    return { recorded: false, skipped: false, category: diagnostic.category };
  }
}
