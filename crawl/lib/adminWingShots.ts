import * as Crypto from 'expo-crypto';

import { supabase } from './supabase';

export type WingReviewAction =
  | 'approve'
  | 'reject'
  | 'retry_processing'
  | 'prioritize'
  | 'remove_priority'
  | 'withdraw_from_queue'
  | 'mark_abuse';

export type WingReviewReason =
  | 'standard_acceptable'
  | 'documented_override'
  | 'not_wings'
  | 'unsafe_content'
  | 'privacy_concern'
  | 'duplicate'
  | 'spam_abuse'
  | 'rights_concern'
  | 'quality_unusable'
  | 'other_policy'
  | 'processing_retry'
  | 'editorial_priority'
  | 'editorial_priority_removed'
  | 'queue_removal'
  | 'duplicate_abuse'
  | 'policy_abuse';

export type AdminQueueItem = {
  submission_id: string;
  media_type: 'photo' | 'video';
  status: string;
  created_at: string;
  upload_age_seconds: number;
  moderation_status: string;
  wing_verification_status: string;
  wing_confidence: number | null;
  quality_score: number | null;
  content_score: number | null;
  priority: number;
  consent: {
    version: string;
    consented_at: string;
    attribution_preference: 'username' | 'display_name' | 'anonymous';
  };
  contributor: {
    user_id: string | null;
    username: string | null;
    prior_features: number;
  };
  restaurant: {
    destination_id: string;
    name: string;
    city: string | null;
    state_id: number | null;
    state_code: string | null;
    state_name: string | null;
    recent_features: number;
  };
  rating: {
    rating_id: string;
    crispiness: number | null;
    sauce: number | null;
    meat: number | null;
    overall: number | null;
    weighted_score: number | null;
    wings_eaten: number | null;
    sauce_style: number | null;
    spice_level: number | null;
    would_order_again: boolean | null;
    flavor_vibe: number[] | null;
    rated_at: string;
  };
  moderation_summary: {
    recommendation: string;
    explanation: string | null;
    flags: string[];
    spam_risk: 'low' | 'medium' | 'high' | null;
    duplicate_risk: 'low' | 'medium' | 'high' | null;
    evaluated_at: string;
  } | null;
  processing: {
    kind: string;
    status: string;
    attempt_count: number;
    max_attempts: number;
    last_error_code: string | null;
    updated_at: string;
  }[];
  duplicate_signals: {
    type: string;
    severity: string;
    similarity: number | null;
    created_at: string;
  }[];
  status_history: {
    from: string | null;
    to: string;
    actor_type: string;
    source: string;
    occurred_at: string;
  }[];
  generated_posts: {
    platform: 'instagram' | 'facebook';
    status: string;
    caption: string;
    alt_text: string | null;
    human_approved: boolean;
  }[];
};

export class AdminWingShotsError extends Error {
  code: 'access_denied' | 'feature_disabled' | 'invalid_input' | 'temporarily_unavailable';

  constructor(
    code: 'access_denied' | 'feature_disabled' | 'invalid_input' | 'temporarily_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'AdminWingShotsError';
    this.code = code;
  }
}

function safeError(error: unknown): AdminWingShotsError {
  const candidate = error as { code?: string; message?: string; status?: number } | null;
  const message = String(candidate?.message ?? '');
  if (message.includes('wing_moderation_queue_disabled')) {
    return new AdminWingShotsError(
      'feature_disabled',
      'The Wing Shots moderation queue is not enabled for this account.',
    );
  }
  if (
    candidate?.code === '42501'
    || candidate?.status === 401
    || candidate?.status === 403
    || message.includes('role_required')
  ) {
    return new AdminWingShotsError(
      'access_denied',
      'This internal review surface is unavailable for this account.',
    );
  }
  return new AdminWingShotsError(
    'temporarily_unavailable',
    'Wing Shot review is temporarily unavailable. Try again.',
  );
}

function correlationId() {
  return Crypto.randomUUID();
}

export async function loadWingAdminQueue(limit = 30): Promise<AdminQueueItem[]> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const { data, error } = await supabase.rpc('get_wing_admin_queue', {
    p_limit: boundedLimit,
  });
  if (error) throw safeError(error);
  return Array.isArray(data) ? (data as AdminQueueItem[]) : [];
}

export async function loadWingAdminPreview(
  submissionId: string,
  variant: 'processed' | 'thumbnail' | 'publication',
): Promise<{ signedUrl: string; expiresInSeconds: number }> {
  const { data: access, error: accessError } = await supabase.rpc(
    'request_wing_media_access',
    {
      p_submission_id: submissionId,
      p_variant: variant,
      p_purpose: 'admin_review',
      p_correlation_id: correlationId(),
    },
  );
  if (accessError || !access?.request_id) throw safeError(accessError);

  const { data, error } = await supabase.functions.invoke('wing-media-preview', {
    body: { request_id: access.request_id },
  });
  if (error || data?.ok !== true || typeof data?.signed_url !== 'string') {
    throw safeError(error);
  }

  let parsed: URL;
  try {
    parsed = new URL(data.signed_url);
  } catch {
    throw new AdminWingShotsError(
      'temporarily_unavailable',
      'The protected preview could not be loaded.',
    );
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new AdminWingShotsError(
      'temporarily_unavailable',
      'The protected preview could not be loaded.',
    );
  }

  return {
    signedUrl: parsed.toString(),
    expiresInSeconds: Math.max(1, Math.min(Number(data.expires_in_seconds) || 60, 60)),
  };
}

export async function submitWingAdminReview(input: {
  submissionId: string;
  action: WingReviewAction;
  reason: WingReviewReason;
  notes: string;
}): Promise<string> {
  const notes = input.notes.trim();
  if (notes.length < 8 || notes.length > 1000) {
    throw new AdminWingShotsError(
      'invalid_input',
      'Add reviewer notes between 8 and 1,000 characters.',
    );
  }
  const operationId = correlationId();
  const { data, error } = await supabase.rpc('review_wing_submission_v2', {
    p_submission_id: input.submissionId,
    p_action: input.action,
    p_reason_category: input.reason,
    p_notes: notes,
    p_idempotency_key: `admin-ui:${operationId}`,
    p_correlation_id: operationId,
  });
  if (error) throw safeError(error);
  if (typeof data !== 'string') {
    throw new AdminWingShotsError(
      'temporarily_unavailable',
      'The review receipt could not be verified.',
    );
  }
  return data;
}
