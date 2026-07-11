// app/profile/UserSettings.jsx (drop-in replacement)
// Adds:
// 1) Shows username between "Your Account" and email
// 2) Allows changing username (no special characters, must be unique)
//
// Notes:
// - This uses an RPC `set_username(new_username text)` for atomic validation + uniqueness.
//   SQL is provided in the chat response.
// - Feedback + Contact Us dialogs remain as-is.

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Linking as RNLinking, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';
import { dbg } from '../../lib/debugLog';
import { trackEvent } from '../../lib/analytics';
import {
  clearFacebookFlowState,
  facebookConfigChecklist,
  getFacebookRedirectUrl,
  isOAuthFlowInProgress,
  runFacebookOAuth,
  sanitizeAuthError,
} from '../../lib/facebookOAuth';
import { canUserAppearSocially } from '../../lib/socialVisibility';
import {
  grantFacebookLinkRewardOnce,
  persistFacebookConnection,
  refreshLinkedProviders,
} from '../../lib/socialAccounts';
import {
  Text,
  Button,
  Card,
  useTheme,
  Avatar,
  Divider,
  List,
  Snackbar,
  ActivityIndicator,
  Portal,
  Dialog,
  Appbar,
  TextInput,
  Switch,
} from 'react-native-paper';

// Complete any pending auth sessions
WebBrowser.maybeCompleteAuthSession();

/* ----------------- Helpers ----------------- */

// Extract Facebook avatar URL from identities (if present)
function getFacebookAvatarUrlFromIdentities(identities = []) {
  const fb = identities.find((i) => i?.provider === 'facebook');
  const data = fb?.identity_data || fb?.identityData || {};
  const direct = data?.avatar_url || data?.picture?.data?.url || data?.picture_url || null;
  const fbId = data?.id || data?.user_id || data?.sub;
  const graph = fbId ? `https://graph.facebook.com/${fbId}/picture?type=large` : null;
  return direct || graph || null;
}

// Local username rules
function normalizeUsername(raw) {
  const v = String(raw ?? '').trim();
  return v;
}
function isValidUsername(v) {
  // No special characters: letters, numbers, underscore only
  // Length: 3 to 20 (change in SQL too if you want a different range)
  return /^[A-Za-z0-9_]{3,20}$/.test(v);
}

/* ----------------- Screen ----------------- */

export default function UserSettings() {
  const { colors } = useTheme();
  const router = useRouter();

  const [session, setSession] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [identities, setIdentities] = useState([]);
  const [linkedProviders, setLinkedProviders] = useState({
    facebook: false,
    google: false,
    email: false,
    loading: true,
    error: null,
  });
  const [facebookConnectedAt, setFacebookConnectedAt] = useState(null);
  const [facebookStatusSource, setFacebookStatusSource] = useState('identities');
  const [linking, setLinking] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  // Preferences state
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefs, setPrefs] = useState(null);

  // Username state
  const [userRowLoading, setUserRowLoading] = useState(false);
  const [username, setUsername] = useState(null);
  const [socialOptOut, setSocialOptOut] = useState(false);
  const [socialOptOutSaving, setSocialOptOutSaving] = useState(false);
  const socialOptOutViewedRef = useRef(false);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  // Dialogs
  const [prefsDialogOpen, setPrefsDialogOpen] = useState(false);
  const [battleDialogOpen, setBattleDialogOpen] = useState(false);

  // Delete Account dialog + busy
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Feedback / Contact dialogs
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [contactText, setContactText] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);

  // Local draft for dialogs
  const [draftPrefs, setDraftPrefs] = useState({
    wing_piece: null, // 1 flats, 2 drums
    sauce_pref: null, // 1 saucy, 2 dry rub
    spicy_pref: null, // 1 yes, 2 no
    prep_pref: null, // 1 fried, 2 grilled, 3 smoked, 4 other
  });

  const [draftBattle, setDraftBattle] = useState({}); // placeholder (unused right now)

  const PREF_LABELS = useMemo(
    () => ({
      wing_piece: {
        title: 'Flats or Drums',
        left: { v: 1, t: 'Flats' },
        right: { v: 2, t: 'Drums' },
      },
      sauce_pref: {
        title: 'Saucy or Dry Rub',
        left: { v: 1, t: 'Saucy' },
        right: { v: 2, t: 'Dry Rub' },
      },
      spicy_pref: {
        title: 'Spicy?',
        left: { v: 1, t: 'Yes' },
        right: { v: 2, t: 'No' },
      },
      prep_pref: {
        title: 'Preferred Prep',
        options: [
          { v: 1, t: 'Fried' },
          { v: 2, t: 'Grilled' },
          { v: 3, t: 'Smoked' },
          { v: 4, t: 'Other' },
        ],
      },
    }),
    []
  );

  // prevent duplicate badge/XP awards
  const awardedRef = useRef(false);
  const oauthFlowActiveRef = useRef(false);

  const email = session?.user?.email ?? '';
  const rawAvatarUrl = session?.user?.user_metadata?.avatar_url ?? null;
  const hasFacebook = linkedProviders.facebook;

  const computedAvatar = useMemo(() => {
    const fbFallback = getFacebookAvatarUrlFromIdentities(identities);
    return rawAvatarUrl || fbFallback || null;
  }, [rawAvatarUrl, identities]);

  const avatarUrl = useMemo(() => {
    if (!computedAvatar) return null;
    const ts = session?.user?.last_sign_in_at || Date.now();
    return `${computedAvatar}${computedAvatar.includes('?') ? '&' : '?'}t=${encodeURIComponent(ts)}`;
  }, [computedAvatar, session?.user?.last_sign_in_at]);

  const showToast = useCallback((msg) => {
    setSnackMsg(msg);
    setSnackVisible(true);
  }, []);

  const refreshUserAndIdentities = useCallback(async () => {
    setLinkedProviders((current) => ({ ...current, loading: true, error: null }));

    try {
      const { data: sessData } = await supabase.auth.getSession();
      const currentSession = sessData?.session ?? null;
      setSession(currentSession);

      if (!currentSession?.user?.id) {
        setIdentities([]);
        setLinkedProviders({
          facebook: false,
          google: false,
          email: false,
          loading: false,
          error: null,
        });
        setFacebookConnectedAt(null);
        setFacebookStatusSource('none');
        return;
      }

      const providerState = await refreshLinkedProviders();
      const ids = providerState.identities ?? [];
      setIdentities(ids);
      setLinkedProviders({
        facebook: providerState.facebook,
        google: providerState.google,
        email: providerState.email,
        loading: false,
        error: providerState.error,
      });
      setFacebookConnectedAt(providerState.facebookConnectedAt || null);
      setFacebookStatusSource(providerState.error ? 'identity_error' : 'identities');
      await dbg(
        'facebook_final_ui_state',
        {
          identityConnected: providerState.facebook,
          source: providerState.error ? 'identity_error' : 'identities',
          providers: providerState.providers || [],
          error: providerState.error,
        },
        'facebook'
      );
    } catch (e) {
      setIdentities([]);
      setLinkedProviders({
        facebook: false,
        google: false,
        email: false,
        loading: false,
        error: e?.message || 'Unable to refresh linked accounts',
      });
      setFacebookConnectedAt(null);
      setFacebookStatusSource('identity_error');
    }
  }, []);

  const loadUserRow = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;

      setUserRowLoading(true);

      const { data: row, error } = await supabase
        .from('users')
        .select('username, social_opt_out')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      const u = row?.username ?? null;
      setUsername(u);
      setUsernameDraft(u ?? '');
      setSocialOptOut(Boolean(row?.social_opt_out));

      if (!socialOptOutViewedRef.current) {
        const currentValue = Boolean(row?.social_opt_out);
        socialOptOutViewedRef.current = true;
        await dbg(
          'social_opt_out_setting_viewed',
          {
            value: currentValue,
            canAppearSocially: canUserAppearSocially({ social_opt_out: currentValue }),
            source_screen: 'settings',
          },
          'privacy'
        );
        trackEvent({
          eventName: 'social_opt_out_setting_viewed',
          screen: 'settings',
          userId: user.id,
          metadata: {
            current_value: currentValue,
            source_screen: 'settings',
          },
        });
      }
    } catch (e) {
      console.log('[users load error]', e);
    } finally {
      setUserRowLoading(false);
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;

      setPrefsLoading(true);

      const { data: prefRow, error: prefErr } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (prefErr) throw prefErr;

      setPrefs(prefRow ?? null);
      setDraftPrefs({
        wing_piece: prefRow?.wing_piece ?? null,
        sauce_pref: prefRow?.sauce_pref ?? null,
        spicy_pref: prefRow?.spicy_pref ?? null,
        prep_pref: prefRow?.prep_pref ?? null,
      });
    } catch (e) {
      console.log('[prefs load error]', e);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  const savePreferences = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;

      setPrefsLoading(true);

      const payload = {
        user_id: user.id,
        wing_piece: draftPrefs.wing_piece,
        sauce_pref: draftPrefs.sauce_pref,
        spicy_pref: draftPrefs.spicy_pref,
        prep_pref: draftPrefs.prep_pref,
      };

      const { error } = await supabase.from('user_preferences').upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;

      setPrefs(payload);
      setPrefsDialogOpen(false);
      showToast('Account Preferences saved.');
    } catch (e) {
      console.log('[prefs save error]', e);
      showToast(`Save failed: ${e?.message ?? 'Unknown error'}`);
    } finally {
      setPrefsLoading(false);
    }
  }, [draftPrefs, showToast]);

  const saveSocialOptOut = useCallback(
    async (nextValue) => {
      if (!session?.user?.id || socialOptOutSaving) return;

      const userId = session.user.id;
      const previousValue = Boolean(socialOptOut);
      const next = Boolean(nextValue);

      setSocialOptOut(next);
      setSocialOptOutSaving(true);

      await dbg(
        'social_opt_out_setting_changed_attempt',
        {
          previous_value: previousValue,
          next_value: next,
          source_screen: 'settings',
        },
        'privacy'
      );

      try {
        const { error } = await supabase
          .from('users')
          .update({ social_opt_out: next })
          .eq('user_id', userId);

        if (error) throw error;

        const timestamp = new Date().toISOString();
        await dbg(
          'social_opt_out_database_update_success',
          {
            previous_value: previousValue,
            next_value: next,
            source_screen: 'settings',
            timestamp,
          },
          'privacy'
        );

        trackEvent({
          eventName: next ? 'social_opt_out_enabled' : 'social_opt_out_disabled',
          screen: 'settings',
          userId,
          metadata: {
            user_id: userId,
            previous_value: previousValue,
            source_screen: 'settings',
            timestamp,
          },
        });

        showToast(next ? 'Social features hidden.' : 'Social features visible again.');
      } catch (e) {
        setSocialOptOut(previousValue);
        await dbg(
          'social_opt_out_database_update_failure',
          {
            previous_value: previousValue,
            attempted_value: next,
            source_screen: 'settings',
            message: e?.message || 'unknown',
          },
          'privacy'
        );
        showToast(`Privacy setting failed: ${e?.message ?? 'Unknown error'}`);
      } finally {
        setSocialOptOutSaving(false);
      }
    },
    [session?.user?.id, showToast, socialOptOut, socialOptOutSaving]
  );

  const labelForPref = useCallback(
    (field, value) => {
      const meta = PREF_LABELS[field];
      if (!meta || value == null) return 'Not set';

      if (field === 'prep_pref') {
        const found = meta.options.find((o) => o.v === value);
        return found?.t ?? 'Not set';
      }

      if (value === meta.left?.v) return meta.left?.t ?? 'Not set';
      if (value === meta.right?.v) return meta.right?.t ?? 'Not set';
      return 'Not set';
    },
    [PREF_LABELS]
  );

  const maybeAwardFacebookBadge = useCallback(async () => {
    try {
      if (awardedRef.current) return;

      const providerState = await refreshLinkedProviders({ syncCache: false });
      const isFB = providerState.facebook;
      if (!isFB) {
        await dbg('facebook_badge_skipped_no_identity', {}, 'facebook');
        return;
      }

      awardedRef.current = true;

      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user?.id) return;
      const reward = await grantFacebookLinkRewardOnce(user.id);
      if (reward.granted) {
        showToast('Facebook connected! +50 XP and badge earned.');
      } else {
        showToast('Facebook connected.');
      }
    } catch (e) {
      await dbg(
        'facebook_badge_grant_failed',
        { message: e?.message || 'unknown' },
        'facebook'
      );
      // non-critical
    }
  }, [showToast]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!mounted) return;
      await refreshUserAndIdentities();
      setInitialized(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const flowActive = await isOAuthFlowInProgress({ mode: 'link_identity' });
      oauthFlowActiveRef.current = flowActive;
      await dbg(
        'facebook_auth_event_observed',
        {
          event,
          flowActive,
          hasSession: Boolean(newSession),
          sessionUserId: newSession?.user?.id || null,
        },
        'facebook'
      );
      setSession(newSession ?? null);

      if (event === 'SIGNED_OUT') {
        if (flowActive) {
          await dbg(
            'facebook_signed_out_ignored_during_link',
            { event, sessionUserId: newSession?.user?.id || null },
            'facebook'
          );
          return;
        }
        try {
          if (router.canGoBack?.()) router.dismissAll?.();
        } catch {}
        setTimeout(() => router.replace('/home'), 0);
        return;
      }

      await refreshUserAndIdentities();

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        const user = newSession?.user;
        const providerState = await refreshLinkedProviders();
        if (user?.id && providerState.facebook) {
          try {
            const saved = await persistFacebookConnection({
              ...user,
              identities: providerState.identities || [],
            });
            setFacebookConnectedAt(saved.connectedAt);
            setFacebookStatusSource('identities');
            if (saved.newlyConnected) await maybeAwardFacebookBadge();
          } catch (e) {
            await dbg(
              'facebook_auth_event_profile_sync_failed',
              { message: e?.message || 'unknown' },
              'facebook'
            );
            showToast(`Facebook connected, but profile sync failed: ${e?.message ?? 'Unknown error'}`);
          }
        }
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [refreshUserAndIdentities, router, maybeAwardFacebookBadge, showToast]);

  // If user not logged in once initialized, bounce to home
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!initialized || session) return;
      const flowActive = await isOAuthFlowInProgress({ mode: 'link_identity' });
      oauthFlowActiveRef.current = flowActive;
      if (cancelled || flowActive) {
        if (flowActive) {
          await dbg(
            'facebook_session_guard_deferred_during_link',
            { route: '/user' },
            'facebook'
          );
        }
        return;
      }
      try {
        if (router.canGoBack?.()) router.dismissAll?.();
      } catch {}
      setTimeout(() => router.replace('/home'), 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialized, session, router]);

  // Load preferences and user row when logged in
  useEffect(() => {
    if (initialized && session?.user?.id) {
      loadPreferences();
      loadUserRow();
    }
  }, [initialized, session?.user?.id, loadPreferences, loadUserRow]);

  /* ----------------- Facebook OAuth ----------------- */

  const handleLoginWithFacebook = useCallback(async () => {
    try {
      setLinking(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const hasSession = Boolean(sessionData?.session?.user?.id);
      const currentUserId = sessionData?.session?.user?.id || null;
      oauthFlowActiveRef.current = hasSession;
      await dbg(
        'facebook_link_preflight',
        {
          currentUserId,
          hasSession,
          method: hasSession ? 'linkIdentity' : 'signInWithOAuth',
          redirectUrl: getFacebookRedirectUrl(),
          returnPath: hasSession ? '/user' : '/(tabs)/home',
        },
        'facebook'
      );
      trackEvent({
        eventName: 'facebook_connect_button_tapped',
        screen: 'settings',
        userId: currentUserId,
        metadata: {
          mode: hasSession ? 'link_identity' : 'sign_in',
          redirect_kind: getFacebookRedirectUrl().startsWith('exp://') ? 'expo' : 'native',
        },
      });

      const mode = hasSession ? 'link_identity' : 'sign_in';
      const result = await runFacebookOAuth({
        mode,
        currentUserId,
        returnPath: hasSession ? '/user' : '/(tabs)/home',
        screen: 'settings',
      });

      if (result.outcome === 'callback') {
        await dbg(
          'facebook_callback_navigation_requested',
          {
            currentUserId,
            method: mode === 'link_identity' ? 'linkIdentity' : 'signInWithOAuth',
            finalRoute: '/auth/callback',
          },
          'facebook'
        );
        trackEvent({
          eventName: 'facebook_oauth_redirect_received',
          screen: 'settings',
          userId: currentUserId,
          metadata: { mode },
        });
        router.replace('/auth/callback');
        return;
      }

      if (result.outcome === 'cancelled') {
        trackEvent({
          eventName: 'facebook_oauth_no_redirect',
          screen: 'settings',
          userId: currentUserId,
          metadata: { result_type: result.resultType || null, mode },
        });
        showToast('Facebook sign-in cancelled.');
        return;
      }

      throw new Error(`Unexpected Facebook auth result: ${result.resultType || result.outcome}`);
    } catch (e) {
      console.log('[FB OAuth error]', e);
      oauthFlowActiveRef.current = false;
      await clearFacebookFlowState();
      await dbg(
        'facebook_oauth_failed',
        {
          ...sanitizeAuthError(e),
          config: facebookConfigChecklist(getFacebookRedirectUrl()),
          finalOutcome: 'failed',
        },
        'facebook'
      );
      trackEvent({
        eventName: 'facebook_oauth_failed',
        screen: 'settings',
        metadata: sanitizeAuthError(e),
      });
      showToast(`Facebook login failed: ${e?.message ?? 'Unknown error'}`);
    } finally {
      setLinking(false);
    }
  }, [router, showToast]);

  /* ----------------- Account Deletion ----------------- */

  const handleDeleteAccount = useCallback(async () => {
    try {
      if (deleting) return;
      setDeleting(true);

      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const token = sessData?.session?.access_token;
      if (!token) throw new Error('No session found. Please sign in again.');

      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { ok: false, error: text };
      }

      if (!res.ok) {
        console.log('[delete-account http error]', {
          status: res.status,
          statusText: res.statusText,
          body: json,
        });
        throw new Error(json?.error || `Delete failed (${res.status})`);
      }

      if (!json?.ok) throw new Error(json?.error || 'Delete failed');

      await supabase.auth.signOut();
      awardedRef.current = false;

      setDeleteDialogOpen(false);
      showToast('Account deleted.');
      setTimeout(() => router.replace('/home'), 200);
    } catch (e) {
      console.log('[delete account error]', e);
      showToast(`Delete failed: ${e?.message ?? 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  }, [router, showToast, deleting]);

  /* ----------------- Username Update ----------------- */

  const openUsernameDialog = useCallback(() => {
    setUsernameDraft(username ?? '');
    setUsernameDialogOpen(true);
  }, [username]);

  const saveUsername = useCallback(async () => {
    try {
      if (usernameSaving) return;
      setUsernameSaving(true);

      const v = normalizeUsername(usernameDraft);

      if (!v) {
        showToast('Please enter a username.');
        return;
      }

      if (!isValidUsername(v)) {
        showToast('Username must be 3 to 20 characters and use letters, numbers, or underscore only.');
        return;
      }

      const { data, error } = await supabase.rpc('set_username', { new_username: v });

      if (error) {
        const msg = String(error?.message ?? '');
        if (msg.toLowerCase().includes('username_taken')) {
          showToast('That username is already taken.');
          return;
        }
        if (msg.toLowerCase().includes('username_invalid')) {
          showToast('That username is not allowed. Use letters, numbers, or underscore only.');
          return;
        }
        throw error;
      }

      // RPC returns the final username
      const finalName = data ?? v;
      setUsername(finalName);
      setUsernameDialogOpen(false);
      showToast('Username updated.');
    } catch (e) {
      console.log('[username save error]', e);
      showToast(`Save failed: ${e?.message ?? 'Unknown error'}`);
    } finally {
      setUsernameSaving(false);
    }
  }, [usernameDraft, usernameSaving, showToast]);

  /* ----------------- Feedback / Contact ----------------- */

  const sanitizeNote = useCallback((s) => {
    const v = String(s ?? '');
    const trimmed = v.replace(/\r\n/g, '\n').trim();
    return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
  }, []);

  const submitSupportNote = useCallback(
    async (kind) => {
      try {
        if (supportSubmitting) return;
        setSupportSubmitting(true);

        const raw = kind === 'feedback' ? feedbackText : contactText;
        const note = sanitizeNote(raw);

        if (!note) {
          showToast('Please type a message first.');
          return;
        }

        const userId = session?.user?.id ?? null;
        const table = kind === 'feedback' ? 'user_feedback' : 'user_contactus';

        const { error } = await supabase.from(table).insert({
          user_id: userId,
          note,
        });

        if (error) throw error;

        if (kind === 'feedback') {
          setFeedbackText('');
          setFeedbackDialogOpen(false);
          showToast('Feedback sent. Thank you!');
        } else {
          setContactText('');
          setContactDialogOpen(false);
          showToast('Message sent. We will get back to you.');
        }
      } catch (e) {
        console.log('[support submit error]', e);
        showToast(`Submit failed: ${e?.message ?? 'Unknown error'}`);
      } finally {
        setSupportSubmitting(false);
      }
    },
    [supportSubmitting, feedbackText, contactText, sanitizeNote, showToast, session?.user?.id]
  );

  /* ----------------- UI Bits ----------------- */

  const rowBorder = colors.outlineVariant || colors.outline || '#2a2a2a';
  const WIN_GREEN = '#16a34a';

  const prefSideBg = useCallback(
    (selectedValue, sideValue) => {
      if (selectedValue == null) return colors.surface;
      return selectedValue === sideValue ? WIN_GREEN : colors.surface;
    },
    [colors.surface]
  );
  const prefTextColor = useCallback(
    (selectedValue, sideValue) => {
      if (selectedValue == null) return colors.onSurface;
      return selectedValue === sideValue ? '#ffffff' : colors.onSurface;
    },
    [colors.onSurface]
  );

  const isAuthed = !!session?.user?.id;

  /* ----------------- Preference Rows ----------------- */

  const renderPrefTwoSide = useCallback(
    ({ title, field, left, right }) => {
      const selected = draftPrefs[field] ?? null;

      const pick = (val) => {
        setDraftPrefs((p) => ({
          ...p,
          [field]: selected === val ? null : val,
        }));
      };

      return (
        <View style={{ marginBottom: 12 }}>
          <Text variant="labelLarge" style={{ marginBottom: 8 }}>
            {title}
          </Text>

          <View
            style={{
              borderWidth: 1.5,
              borderColor: rowBorder,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <View style={{ flexDirection: 'row' }}>
              <Pressable
                onPress={() => pick(left.v)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.9 : 1,
                    backgroundColor: prefSideBg(selected, left.v),
                    borderRightWidth: 1.5,
                    borderRightColor: rowBorder,
                  },
                ]}
              >
                <Text
                  variant="bodyMedium"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    color: prefTextColor(selected, left.v),
                    fontWeight: '800',
                  }}
                >
                  {left.t}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => pick(right.v)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.9 : 1,
                    backgroundColor: prefSideBg(selected, right.v),
                  },
                ]}
              >
                <Text
                  variant="bodyMedium"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    color: prefTextColor(selected, right.v),
                    fontWeight: '800',
                  }}
                >
                  {right.t}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    },
    [draftPrefs, rowBorder, prefSideBg, prefTextColor]
  );

  const renderPrepGrid = useCallback(
    ({ title, field, options }) => {
      const selected = draftPrefs[field] ?? null;

      const pick = (val) => {
        setDraftPrefs((p) => ({
          ...p,
          [field]: selected === val ? null : val,
        }));
      };

      return (
        <View style={{ marginBottom: 4 }}>
          <Text variant="labelLarge" style={{ marginBottom: 8 }}>
            {title}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {options.map((opt) => {
              const isSel = selected === opt.v;
              return (
                <Pressable
                  key={opt.v}
                  onPress={() => pick(opt.v)}
                  style={({ pressed }) => [
                    {
                      width: '48%',
                      borderWidth: 1.5,
                      borderColor: rowBorder,
                      borderRadius: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.9 : 1,
                      backgroundColor: isSel ? WIN_GREEN : colors.surface,
                    },
                  ]}
                >
                  <Text
                    variant="bodyMedium"
                    numberOfLines={1}
                    style={{
                      color: isSel ? '#ffffff' : colors.onSurface,
                      fontWeight: '800',
                    }}
                  >
                    {opt.t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    },
    [draftPrefs, colors.surface, colors.onSurface, rowBorder]
  );

  /* ----------------- Render ----------------- */

  const prettyUsername = username ? `@${username}` : userRowLoading ? 'Loading…' : 'No username set';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Appbar.Header elevated={false} style={{ backgroundColor: 'transparent' }}>
        <Appbar.BackAction
          onPress={() => {
            try {
              if (router.canGoBack?.()) router.back();
              else router.replace('/home');
            } catch {
              router.replace('/home');
            }
          }}
        />
        <Appbar.Content title="Settings" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Account Card */}
        <Card style={{ borderRadius: 16 }}>
          <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {avatarUrl ? <Avatar.Image size={64} source={{ uri: avatarUrl }} /> : <Avatar.Icon size={64} icon="account-circle" />}
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium">Your Account</Text>

              {/* ✅ Username line between title and email */}
              <Text variant="bodyMedium" style={{ fontWeight: '800', marginTop: 2 }}>
                {prettyUsername}
              </Text>

              <Text variant="bodySmall" style={{ opacity: 0.8, marginTop: 2 }}>
                {email || 'Guest'}
              </Text>

              {session && (
                <View style={{ marginTop: 6 }}>
                  <Text variant="labelSmall" style={{ opacity: 0.8 }}>
                    Facebook: {linkedProviders.loading ? 'Checking...' : hasFacebook ? 'Connected' : 'Not linked'}
                    {hasFacebook && facebookConnectedAt ? ` since ${new Date(facebookConnectedAt).toLocaleDateString()}` : ''}
                  </Text>
                  {facebookStatusSource === 'identity_error' || linkedProviders.error ? (
                    <Text variant="labelSmall" style={{ opacity: 0.7 }}>
                      Could not refresh linked account status. Reopen settings to retry.
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Profile */}
        <Card style={{ borderRadius: 16 }}>
          <List.Section>
            <List.Subheader>Profile</List.Subheader>
            <Divider />

            <List.Item
              title="Username"
              description={prettyUsername}
              left={(p) => <List.Icon {...p} icon="account-badge" />}
              right={(p) => <List.Icon {...p} icon="chevron-right" />}
              onPress={() => {
                if (!isAuthed) return showToast('Sign in to set your username.');
                openUsernameDialog();
              }}
            />

            <Divider />

            <List.Item
              title="Your Wing Preferences"
              description={
                !isAuthed
                  ? 'Sign in to set your wing preferences.'
                  : prefsLoading
                  ? 'Loading…'
                  : [
                      `Flats/Drums: ${labelForPref('wing_piece', prefs?.wing_piece)}`,
                      `Sauce: ${labelForPref('sauce_pref', prefs?.sauce_pref)}`,
                      `Spicy: ${labelForPref('spicy_pref', prefs?.spicy_pref)}`,
                      `Prep: ${labelForPref('prep_pref', prefs?.prep_pref)}`,
                    ].join('  •  ')
              }
              left={(p) => <List.Icon {...p} icon="tune-variant" />}
              right={(p) => <List.Icon {...p} icon="chevron-right" />}
              onPress={() => {
                if (!isAuthed) return showToast('Sign in to edit preferences.');
                setPrefsDialogOpen(true);
              }}
            />

            <Divider />
          </List.Section>
        </Card>

        {/* Support */}
        <Card style={{ borderRadius: 16 }}>
          <List.Section>
            <List.Subheader>Support</List.Subheader>
            <Divider />

            <List.Item
              title="Feedback"
              description="Help improve BuffaGo"
              left={(p) => <List.Icon {...p} icon="message-text" />}
              right={(p) => <List.Icon {...p} icon="chevron-right" />}
              onPress={() => setFeedbackDialogOpen(true)}
            />
            <Divider />

            <List.Item
              title="Contact Us"
              description="Need help? Send a message"
              left={(p) => <List.Icon {...p} icon="email-outline" />}
              right={(p) => <List.Icon {...p} icon="chevron-right" />}
              onPress={() => setContactDialogOpen(true)}
            />
            <Divider />

            <List.Item
              title="Privacy Policy"
              left={(p) => <List.Icon {...p} icon="shield-check" />}
              onPress={() =>
                RNLinking.openURL(
                  'https://docs.google.com/document/d/1IWKk8s4v5oS4a4NjzLcCM6c4jgsVnOJjrpA4axVAXCw/edit?usp=sharing'
                )
              }
            />
          </List.Section>
        </Card>

        {/* Account */}
        <Card style={{ borderRadius: 16 }}>
          <List.Section>
            <List.Subheader>Account</List.Subheader>
            <Divider />

            <List.Item
              title="Change Password"
              description="Update your password for this account."
              left={(p) => <List.Icon {...p} icon="lock-reset" />}
              onPress={() => {
                if (!isAuthed) return showToast('Sign in to change your password.');
                router.push('/auth/change-password');
              }}
            />

            <Divider />

            <List.Item
              title="Delete Account"
              description="Permanently delete your account and data."
              left={(p) => <List.Icon {...p} icon="account-remove" />}
              titleStyle={{ color: '#dc2626', fontWeight: '800' }}
              onPress={() => {
                if (!isAuthed) return showToast('Sign in to delete your account.');
                setDeleteDialogOpen(true);
              }}
            />
          </List.Section>
        </Card>

        {/* Social Privacy */}
        {session ? (
          <Card style={{ borderRadius: 16 }}>
            <List.Section>
              <List.Subheader>Social Privacy</List.Subheader>
              <Divider />

              <List.Item
                title="Hide From Social"
                description="Optional social features are off when enabled. You are hidden from leaderboards, feeds, friend search, friend activity, and profile friend actions."
                titleNumberOfLines={1}
                descriptionNumberOfLines={3}
                style={{ paddingRight: 8, paddingVertical: 10 }}
                titleStyle={{ fontWeight: '700' }}
                descriptionStyle={{ lineHeight: 18 }}
                left={(p) => <List.Icon {...p} icon="eye-off-outline" />}
                right={() => (
                  <View style={{ justifyContent: 'center', paddingLeft: 8 }}>
                    <Switch
                      value={socialOptOut}
                      disabled={socialOptOutSaving}
                      onValueChange={saveSocialOptOut}
                    />
                  </View>
                )}
              />
            </List.Section>
          </Card>
        ) : null}

        {/* Facebook login / link */}
        {(!session || !hasFacebook) && (
          <Button mode="contained" style={{ borderRadius: 12 }} icon="facebook" disabled={linking} onPress={handleLoginWithFacebook}>
            {linking ? <ActivityIndicator animating /> : 'Connect Facebook'}
          </Button>
        )}

        {/* Auth buttons */}
        {session ? (
          <Button
            mode="outlined"
            style={{ borderRadius: 12 }}
            onPress={async () => {
              await supabase.auth.signOut();
              awardedRef.current = false;
            }}
          >
            Sign out
          </Button>
        ) : (
          <Button mode="contained" style={{ borderRadius: 12 }} onPress={() => router.push('/auth/login')}>
            Sign in / Sign up
          </Button>
        )}
      </ScrollView>

      <Portal>
        {/* Username Dialog */}
        <Dialog visible={usernameDialogOpen} onDismiss={() => (usernameSaving ? null : setUsernameDialogOpen(false))} style={{ borderRadius: 16 }}>
          <Dialog.Title>Change username</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ opacity: 0.8, marginBottom: 10 }}>
              Letters, numbers, and underscore only. 3 to 20 characters. No duplicates.
            </Text>

            <TextInput
              mode="outlined"
              value={usernameDraft}
              onChangeText={(t) => setUsernameDraft(t)}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="example: wingking_23"
            />

            <View style={{ marginTop: 8 }}>
              <Text variant="labelSmall" style={{ opacity: 0.8 }}>
                Preview: @{normalizeUsername(usernameDraft) || 'username'}
              </Text>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={usernameSaving} onPress={() => setUsernameDialogOpen(false)}>
              Cancel
            </Button>
            <Button mode="contained" loading={usernameSaving} onPress={saveUsername}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Feedback Dialog */}
        <Dialog visible={feedbackDialogOpen} onDismiss={() => (supportSubmitting ? null : setFeedbackDialogOpen(false))} style={{ borderRadius: 16 }}>
          <Dialog.Title>Feedback</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ opacity: 0.8, marginBottom: 10 }}>
              What should we improve?
            </Text>

            <TextInput
              mode="outlined"
              value={feedbackText}
              onChangeText={(t) => setFeedbackText(t.slice(0, 500))}
              placeholder="Type your feedback…"
              multiline
              numberOfLines={5}
              maxLength={500}
              style={{ marginBottom: 8 }}
            />

            <Text variant="labelSmall" style={{ opacity: 0.8 }}>
              {feedbackText.length}/500
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={supportSubmitting} onPress={() => setFeedbackDialogOpen(false)}>
              Cancel
            </Button>
            <Button mode="contained" loading={supportSubmitting} onPress={() => submitSupportNote('feedback')}>
              Submit
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Contact Us Dialog */}
        <Dialog visible={contactDialogOpen} onDismiss={() => (supportSubmitting ? null : setContactDialogOpen(false))} style={{ borderRadius: 16 }}>
          <Dialog.Title>Contact Us</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ opacity: 0.8, marginBottom: 10 }}>
              Tell us what you need help with.
            </Text>

            <TextInput
              mode="outlined"
              value={contactText}
              onChangeText={(t) => setContactText(t.slice(0, 500))}
              placeholder="Type your message…"
              multiline
              numberOfLines={5}
              maxLength={500}
              style={{ marginBottom: 8 }}
            />

            <Text variant="labelSmall" style={{ opacity: 0.8 }}>
              {contactText.length}/500
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={supportSubmitting} onPress={() => setContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button mode="contained" loading={supportSubmitting} onPress={() => submitSupportNote('contact')}>
              Send
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Account Preferences Dialog */}
        <Dialog visible={prefsDialogOpen} onDismiss={() => setPrefsDialogOpen(false)} style={{ borderRadius: 16 }}>
          <Dialog.Title>Account Preferences</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ opacity: 0.8, marginBottom: 12 }}>
              Tap an option to select it. Tap again to clear.
            </Text>

            {renderPrefTwoSide({
              title: PREF_LABELS.wing_piece.title,
              field: 'wing_piece',
              left: PREF_LABELS.wing_piece.left,
              right: PREF_LABELS.wing_piece.right,
            })}

            {renderPrefTwoSide({
              title: PREF_LABELS.sauce_pref.title,
              field: 'sauce_pref',
              left: PREF_LABELS.sauce_pref.left,
              right: PREF_LABELS.sauce_pref.right,
            })}

            {renderPrefTwoSide({
              title: PREF_LABELS.spicy_pref.title,
              field: 'spicy_pref',
              left: PREF_LABELS.spicy_pref.left,
              right: PREF_LABELS.spicy_pref.right,
            })}

            {renderPrepGrid({
              title: PREF_LABELS.prep_pref.title,
              field: 'prep_pref',
              options: PREF_LABELS.prep_pref.options,
            })}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPrefsDialogOpen(false)}>Cancel</Button>
            <Button mode="contained" loading={prefsLoading} onPress={savePreferences}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Wing Battle Dialog (placeholder) */}
        <Dialog visible={battleDialogOpen} onDismiss={() => setBattleDialogOpen(false)} style={{ borderRadius: 16, marginHorizontal: 10 }}>
          <Dialog.Title>Which would you order?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ opacity: 0.8, marginBottom: 10 }}>
              Pick the winner. Winner = green, loser = red. Tap again to clear.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setBattleDialogOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Account confirmation */}
        <Dialog visible={deleteDialogOpen} onDismiss={() => (deleting ? null : setDeleteDialogOpen(false))} style={{ borderRadius: 16 }}>
          <Dialog.Title style={{ color: '#dc2626' }}>Delete account?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
              This will permanently delete your BuffaGo account and associated data.
            </Text>
            <Text variant="bodySmall" style={{ opacity: 0.8 }}>
              This cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={deleting} onPress={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button mode="contained" buttonColor="#dc2626" textColor="#ffffff" loading={deleting} onPress={handleDeleteAccount}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={2500}
        action={{ label: 'OK', onPress: () => setSnackVisible(false) }}
      >
        {snackMsg}
      </Snackbar>
    </SafeAreaView>
  );
}
