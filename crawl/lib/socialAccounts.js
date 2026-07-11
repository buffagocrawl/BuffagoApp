import { supabase } from './supabase';
import { dbg } from './debugLog';

const EMPTY_LINKED_PROVIDER_STATE = Object.freeze({
  facebook: false,
  google: false,
  email: false,
  providers: [],
  identities: [],
  facebookConnectedAt: null,
  loading: false,
  error: null,
});

let linkedProvidersRefreshPromise = null;

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export function normalizeLinkedProviders(identities = []) {
  const list = Array.isArray(identities) ? identities.filter(Boolean) : [];
  const providers = [...new Set(list.map((identity) => identity?.provider).filter(Boolean))];

  return {
    facebook: providers.includes('facebook'),
    google: providers.includes('google'),
    email: providers.includes('email'),
    providers,
    identities: list,
    facebookConnectedAt: null,
    loading: false,
    error: null,
  };
}

export async function refreshLinkedProviders({ syncCache = true } = {}) {
  if (linkedProvidersRefreshPromise) return linkedProvidersRefreshPromise;

  linkedProvidersRefreshPromise = (async () => {
    try {
      const { data: sessionData, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        12000,
        'Timed out while checking the current session'
      );
      if (sessionError) throw sessionError;

      const userId = sessionData?.session?.user?.id || null;
      if (!userId) return { ...EMPTY_LINKED_PROVIDER_STATE };

      const { data, error } = await withTimeout(
        supabase.auth.getUserIdentities(),
        12000,
        'Timed out while checking linked accounts'
      );
      if (error) throw error;

      const identities = data?.identities || (Array.isArray(data) ? data : []);
      const state = normalizeLinkedProviders(identities);

      let cacheResult = null;
      if (syncCache) {
        cacheResult = await syncFacebookConnectionCache(userId, state, { previousConnected: null }).catch(async (cacheError) => {
          await dbg(
            'facebook_profile_cache_sync_failed',
            { message: cacheError?.message || 'unknown' },
            'facebook'
          );
          return null;
        });
      }

      return {
        ...state,
        facebookConnectedAt: state.facebook ? cacheResult?.connectedAt || null : null,
      };
    } catch (error) {
      await dbg(
        'linked_provider_refresh_failed',
        { message: error?.message || 'unknown' },
        'auth'
      );
      return {
        ...EMPTY_LINKED_PROVIDER_STATE,
        error: error?.message || 'Unable to refresh linked accounts',
      };
    } finally {
      linkedProvidersRefreshPromise = null;
    }
  })();

  return linkedProvidersRefreshPromise;
}

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

export async function syncFacebookConnectionCache(
  userId,
  providerStateOrIdentities,
  { previousConnected = null, previousConnectedAt = null } = {}
) {
  if (!userId) return { connected: false, providerId: null, connectedAt: null, newlyConnected: false };

  const identities = Array.isArray(providerStateOrIdentities)
    ? providerStateOrIdentities
    : providerStateOrIdentities?.identities || [];
  const facebookIdentity = getFacebookIdentity(identities);
  const connected = Boolean(facebookIdentity);
  const providerId = getFacebookProviderId(identities);
  const existing =
    previousConnected === null
      ? await readFacebookConnection(userId)
      : {
          connected: previousConnected,
          connectedAt: previousConnectedAt,
          source: 'provided',
        };
  const connectedAt = connected
    ? existing.connected
      ? existing.connectedAt || new Date().toISOString()
      : new Date().toISOString()
    : null;

  const payload = {
    user_id: userId,
    facebook_connected: connected,
    facebook_provider_id: connected ? providerId : null,
    facebook_connected_at: connected ? connectedAt : null,
  };

  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;

  return {
    connected,
    providerId: connected ? providerId : null,
    connectedAt,
    newlyConnected: connected && !existing.connected,
  };
}

export async function persistFacebookConnection(
  user,
  { previousConnected = null, previousConnectedAt = null } = {}
) {
  const userId = user?.id;
  if (!userId) throw new Error('No authenticated user to link Facebook');

  const fb = getFacebookIdentity(user);
  if (!fb) throw new Error('Facebook identity not present after OAuth');

  await dbg(
    'facebook_profile_update_attempt',
    {
      userId,
      hasProviderId: Boolean(getFacebookProviderId(user)),
      previousConnected: Boolean(previousConnected),
    },
    'facebook'
  );

  try {
    const saved = await syncFacebookConnectionCache(userId, user?.identities || [], {
      previousConnected,
      previousConnectedAt,
    });

    await dbg(
      'facebook_profile_update_succeeded',
      {
        userId,
        hasProviderId: Boolean(saved.providerId),
        connectedAt: saved.connectedAt,
      },
      'facebook'
    );

    return saved;
  } catch (error) {
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
