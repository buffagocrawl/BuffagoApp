import { supabase } from './supabase';
import { dbg } from './debugLog';

export function getFacebookIdentity(userOrIdentities) {
  const identities = Array.isArray(userOrIdentities)
    ? userOrIdentities
    : userOrIdentities?.identities || [];

  return identities.find((identity) => identity?.provider === 'facebook') || null;
}

export function getFacebookProviderId(userOrIdentities) {
  const fb = getFacebookIdentity(userOrIdentities);
  const data = fb?.identity_data || fb?.identityData || {};
  return data?.id || data?.user_id || data?.sub || fb?.id || null;
}

export async function readFacebookConnection(userId) {
  if (!userId) return { connected: false, providerId: null, connectedAt: null, source: 'none' };

  const { data, error } = await supabase
    .from('users')
    .select('facebook_connected, facebook_provider_id, facebook_connected_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    await dbg(
      'facebook_profile_read_failed',
      {
        code: error?.code || null,
        message: error?.message || 'unknown',
      },
      'facebook'
    );
    return {
      connected: false,
      providerId: null,
      connectedAt: null,
      source: 'read_error',
      error,
    };
  }

  return {
    connected: Boolean(data?.facebook_connected),
    providerId: data?.facebook_provider_id || null,
    connectedAt: data?.facebook_connected_at || null,
    source: 'users',
  };
}

export async function persistFacebookConnection(
  user,
  { previousConnected = false, previousConnectedAt = null } = {}
) {
  const userId = user?.id;
  if (!userId) throw new Error('No authenticated user to link Facebook');

  const fb = getFacebookIdentity(user);
  if (!fb) throw new Error('Facebook identity not present after OAuth');

  const providerId = getFacebookProviderId(user);
  const connectedAt = previousConnected
    ? previousConnectedAt || new Date().toISOString()
    : new Date().toISOString();

  await dbg(
    'facebook_profile_update_attempt',
    {
      userId,
      hasProviderId: Boolean(providerId),
      previousConnected: Boolean(previousConnected),
    },
    'facebook'
  );

  const payload = {
    user_id: userId,
    facebook_connected: true,
    facebook_provider_id: providerId,
  };
  if (!previousConnected) payload.facebook_connected_at = connectedAt;

  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'user_id' });

  if (error) {
    await dbg(
      'facebook_profile_update_failed',
      {
        code: error?.code || null,
        message: error?.message || 'unknown',
      },
      'facebook'
    );
    throw error;
  }

  await dbg(
    'facebook_profile_update_succeeded',
    {
      userId,
      hasProviderId: Boolean(providerId),
      connectedAt,
    },
    'facebook'
  );

  return {
    connected: true,
    providerId,
    connectedAt,
    newlyConnected: !previousConnected,
  };
}

export async function grantFacebookLinkRewardOnce(userId) {
  if (!userId) return { granted: false, reason: 'missing_user' };

  await dbg('facebook_badge_grant_attempt', { userId }, 'facebook');

  const { data: badge, error: badgeErr } = await supabase
    .from('badge_catalog')
    .select('id')
    .eq('code', 'link_facebook')
    .maybeSingle();

  if (badgeErr) {
    await dbg(
      'facebook_badge_lookup_failed',
      { code: badgeErr?.code || null, message: badgeErr?.message || 'unknown' },
      'facebook'
    );
    throw badgeErr;
  }

  if (badge?.id) {
    const { data: existing, error: existingErr } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .maybeSingle();

    if (existingErr) {
      await dbg(
        'facebook_badge_existing_check_failed',
        { code: existingErr?.code || null, message: existingErr?.message || 'unknown' },
        'facebook'
      );
      throw existingErr;
    }

    if (existing) {
      await dbg('facebook_badge_grant_skipped_already_earned', { userId }, 'facebook');
      return { granted: false, reason: 'already_earned' };
    }
  }

  const { error: xpErr } = await supabase.rpc('xp_add', {
    amount: 50,
    reason: 'link_facebook',
    user_id: userId,
  });
  if (xpErr) {
    await dbg(
      'facebook_xp_grant_failed',
      { code: xpErr?.code || null, message: xpErr?.message || 'unknown' },
      'facebook'
    );
    throw xpErr;
  }

  const { error: earnErr } = await supabase.rpc('earn_badge', {
    badge_key: 'link_facebook',
    user_id: userId,
  });
  if (earnErr) {
    await dbg(
      'facebook_badge_grant_failed',
      { code: earnErr?.code || null, message: earnErr?.message || 'unknown' },
      'facebook'
    );
    throw earnErr;
  }

  await dbg('facebook_badge_grant_succeeded', { userId }, 'facebook');
  return { granted: true, reason: 'granted' };
}
