// app/auth/login.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  Text,
  TextInput,
  Button,
  Card,
  HelperText,
  ActivityIndicator,
  SegmentedButtons,
  Snackbar,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase.js';
import {
  getPasswordSignInErrorMessage,
  runPasswordSignInAttempt,
} from '../../lib/passwordSignInFlow';
import { dbg } from '../../lib/debugLog';
import {
  clearOAuthFlowState,
  facebookConfigChecklist,
  getFacebookRedirectUrl,
  runSocialOAuth,
  sanitizeAuthError,
} from '../../lib/facebookOAuth';
import {
  executeSocialAuth,
  getSocialAuthButtonModels,
  getSocialAuthErrorMessage,
} from '../../lib/socialAuthHelpers';
import { ENABLE_GOOGLE_AUTH } from '../../config/features';
import { trackEvent } from '../../lib/analytics';
import { submitBuffacoinRatingTransaction } from '../../lib/buffacoinRatingTransaction';

// Handoff page (Netlify) includes trailing slash
const RESET_HANDOFF_URL = 'https://curious-quokka-dbae0b.netlify.app/';

// Onboarding keys (match OnboardingFlow)
const ONBOARDING_SEED_RATING_KEY = 'buffago:onboarding:seed_rating';
const ONBOARDING_DEST_SUGGESTION_KEY = 'buffago:onboarding:dest_suggestion';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const CAYENNE_E2E_DIAGNOSTICS = process.env.EXPO_PUBLIC_CAYENNE_E2E === 'true';

// These diagnostics are deliberately value-free: they establish the auth
// lifecycle in a local E2E artifact without recording identities, tokens, or
// backend payloads. They are compiled only for the local E2E build.
const cayenneAuthStage = (stage, category) => {
  if (!CAYENNE_E2E_DIAGNOSTICS) return;
  console.info('[cayenne-auth-stage]', stage, Date.now(), category || '');
};

const passwordAuthDiagnostic = (stage) => {
  if (__DEV__) console.info('[password-auth]', stage);
  cayenneAuthStage(stage);
};

// Same helper Ratings screen uses
const deriveStateCode = (address) => {
  if (!address || typeof address !== 'string') return null;

  const m = address.match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?/);
  if (m) return m[1];

  const parts = address.split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const token = parts[i].trim();
    const m2 = token.match(/^([A-Z]{2})(\s*\d{5})?$/i);
    if (m2) return m2[1].toUpperCase();
  }

  return null;
};

const toScoreOrNull = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n);
  if (c < 1 || c > 10) return null;
  return c;
};

const pickDisplayName = (user) => {
  const md = user?.user_metadata || {};
  return md.username || md.full_name || md.name || md.display_name || md.preferred_username || '';
};

const normalizeUsername = (raw) => {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);

  if (base.length >= 3 && USERNAME_REGEX.test(base)) return base;

  // fallback
  return `user_${Math.floor(Math.random() * 90000 + 10000)}`;
};

export default function EmailAuthScreen() {
  const router = useRouter();
  const theme = useTheme();

  // ✅ default to SIGN UP now
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeSocialProvider, setActiveSocialProvider] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '' });
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      busyRef.current = false;
    };
  }, []);

  const show = (msg) => setSnack({ open: true, msg: String(msg || '') });

  const emailValid = useMemo(() => /^\S+@\S+\.\S+$/.test(email), [email]);
  const pwdValid = useMemo(() => password.length >= 6, [password]);
  const unameTrim = useMemo(() => String(username || '').trim(), [username]);
  const unameValid = useMemo(() => USERNAME_REGEX.test(unameTrim), [unameTrim]);

  const canSubmit = emailValid && pwdValid && (mode === 'signin' || (mode === 'signup' && unameValid));

  // Username check for signup
  const isUsernameTaken = async (name) => {
    const u = String(name || '').trim();

    if (!USERNAME_REGEX.test(u)) {
      return {
        taken: true,
        reason: 'Username must be 3 to 20 characters and use only letters, numbers, underscore.',
      };
    }

    const { data, error } = await supabase
      .from('users')
      .select('user_id')
      .ilike('username', u) // safe because % and _ are disallowed
      .limit(1);

    // Do not block signup on transient read errors
    if (error) return { taken: false, reason: null };

    return { taken: Array.isArray(data) && data.length > 0, reason: null };
  };

  // Only fill username if missing; always set avatar_url if we have it
  const upsertProfileFromAuth = async (user) => {
    const userId = user?.id;
    if (!userId) return;

    const displayName = pickDisplayName(user);
    const desiredUsername = normalizeUsername(displayName);

    const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

    // Read existing profile
    const { data: existing, error: readErr } = await supabase
      .from('users')
      .select('username, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();

    // If we cannot read, still try a safe upsert (best effort)
    const existingUsername = readErr ? null : existing?.username || null;
    const existingAvatar = readErr ? null : existing?.avatar_url || null;

    const wantsUsername = !existingUsername || String(existingUsername).trim().length === 0;
    const wantsAvatar = !!avatarUrl && avatarUrl !== existingAvatar;

    if (!wantsUsername && !wantsAvatar) return;

    const payload = { user_id: userId };
    if (wantsUsername) payload.username = desiredUsername;
    if (wantsAvatar) payload.avatar_url = avatarUrl;

    // Handle possible username collision by retrying a few variants
    for (let attempt = 0; attempt < 4; attempt++) {
      const tryPayload = { ...payload };

      if (wantsUsername && attempt > 0) {
        const suffix = String(Math.floor(Math.random() * 900 + 100)); // 3 digits
        const base = desiredUsername.slice(0, Math.max(0, 20 - (suffix.length + 1)));
        tryPayload.username = `${base}_${suffix}`.slice(0, 20);
      }

      const { error: upErr } = await supabase.from('users').upsert(tryPayload, { onConflict: 'user_id' });

      if (!upErr) return;

      const msg = String(upErr.message || '').toLowerCase();
      const isUnique = msg.includes('duplicate') || msg.includes('unique');

      // If avatar-only update failed due to something else, bubble it
      if (!wantsUsername || !isUnique) throw upErr;
      // else retry username variant
    }

    throw new Error('Could not set username. Please choose a username manually.');
  };

  // Grants exactly 1 coin for onboarding seed bonus, only once per user
  const grantOnboardingSeedCoinIfNeeded = async (userId) => {
    if (!userId) return;

    const { data: existing, error: checkErr } = await supabase
      .from('buffacoin_ledger')
      .select('id')
      .eq('user_id', userId)
      .eq('reason', 'onboarding_seed_bonus')
      .limit(1);

    if (checkErr) {
      console.warn('seed coin check failed', checkErr?.message || checkErr);
      return;
    }

    if (Array.isArray(existing) && existing.length > 0) return;

    const { error: insErr } = await supabase.from('buffacoin_ledger').insert({
      user_id: userId,
      delta: 1,
      reason: 'onboarding_seed_bonus',
      created_at: new Date().toISOString(),
    });

    if (insErr) console.warn('seed coin insert failed', insErr?.message || insErr);
  };

  const applyOnboardingDestinationSuggestionIfAny = async (userId) => {
    try {
      const raw = await AsyncStorage.getItem(ONBOARDING_DEST_SUGGESTION_KEY);
      if (!raw) return;

      let sug = null;
      try {
        sug = JSON.parse(raw);
      } catch {
        await AsyncStorage.removeItem(ONBOARDING_DEST_SUGGESTION_KEY);
        return;
      }

      const name = String(sug?.restaurant_name || '').trim();
      if (!name) {
        await AsyncStorage.removeItem(ONBOARDING_DEST_SUGGESTION_KEY);
        return;
      }

      const { error } = await supabase.from('destination_suggestions').insert({
        user_id: userId,
        state_id: sug?.state_id ?? null,
        restaurant_name: name,
        address: sug?.address ?? null,
      });

      if (error) throw error;

      await AsyncStorage.removeItem(ONBOARDING_DEST_SUGGESTION_KEY);
    } catch (e) {
      console.warn('applyOnboardingDestinationSuggestionIfAny failed', e?.message || e);
    }
  };

  const applyOnboardingSeedRatingIfAny = async (userId) => {
    try {
      const raw = await AsyncStorage.getItem(ONBOARDING_SEED_RATING_KEY);
      if (!raw) return;

      let seed = null;
      try {
        const parsed = JSON.parse(raw);
        seed = parsed?.status === 'local_preview' ? parsed.payload : parsed;
      } catch {
        await AsyncStorage.removeItem(ONBOARDING_SEED_RATING_KEY);
        return;
      }

      const destinationId = seed?.destination_id;
      if (!destinationId) {
        await AsyncStorage.removeItem(ONBOARDING_SEED_RATING_KEY);
        return;
      }

      // Determine state code for token crawl
      let stateCode = String(seed?.state_code || '').trim().toUpperCase();

      if (!stateCode) {
        const { data: dest, error: destErr } = await supabase
          .from('destinations')
          .select('address')
          .eq('id', destinationId)
          .maybeSingle();

        if (!destErr) stateCode = deriveStateCode(dest?.address || '') || '';
      }

      if (!stateCode) {
        console.warn('seed rating could not determine state code');
        return;
      }

      // Make sure user can spend one coin right away
      await grantOnboardingSeedCoinIfNeeded(userId);

      const operationId = seed?.operation_id || Crypto.randomUUID();
      if (!seed?.operation_id) {
        seed = { ...seed, operation_id: operationId };
        await AsyncStorage.setItem(ONBOARDING_SEED_RATING_KEY, JSON.stringify(seed));
      }
      await submitBuffacoinRatingTransaction({
        supabase,
        operationId,
        destinationId,
        stateCode,
        coinCost: 1,
        rating: {
        crispiness: toScoreOrNull(seed?.crispiness),
        sauce: toScoreOrNull(seed?.sauce),
        meat: toScoreOrNull(seed?.meat),
        overall: toScoreOrNull(seed?.overall),
        would_order_again: typeof seed?.would_order_again === 'boolean' ? seed.would_order_again : null,
        },
      });

      await AsyncStorage.removeItem(ONBOARDING_SEED_RATING_KEY);
    } catch (e) {
      console.warn('applyOnboardingSeedRatingIfAny failed', e?.message || e);
    }
  };

  const afterAuthSuccess = async (user) => {
    if (!user?.id) throw new Error('Missing authenticated user.');

    try {
      await upsertProfileFromAuth(user);
    } catch (e) {
      console.warn('afterAuthSuccess profile upsert skipped', e?.message || e);
      throw e;
    }

    await applyOnboardingDestinationSuggestionIfAny(user.id);
    await applyOnboardingSeedRatingIfAny(user.id);
  };

  const startSocialOAuth = async (provider) => {
    const result = await runSocialOAuth({
      provider,
      mode: 'sign_in',
      currentUserId: null,
      returnPath: '/(tabs)/home',
      screen: 'auth/login',
    });

    if (result.outcome === 'callback' || result.outcome === 'cancelled') {
      return result;
    }

    throw new Error(`Unexpected ${provider} auth result: ${result.resultType || result.outcome}`);
  };

  const handleSocialAuth = async (provider) => {
    try {
      await trackEvent({ eventName: 'auth_started', screen: 'auth/login', metadata: { auth_method: 'oauth' } });
      await trackEvent({ eventName: 'auth_provider_selected', screen: 'auth/login', metadata: { provider } });
      const result = await executeSocialAuth(provider, {
        activeProvider: activeSocialProvider,
        setActiveProvider: setActiveSocialProvider,
        startOAuth: startSocialOAuth,
        onCallbackReady: async () => {
          router.replace('/auth/callback');
        },
        onCancelled: async (cancelledProvider) => {
          show(`${cancelledProvider === 'google' ? 'Google' : 'Facebook'} sign-in cancelled.`);
        },
      });

      if (result.blocked || result.outcome === 'callback' || result.outcome === 'cancelled') {
        return;
      }

      throw new Error(`Unexpected ${provider} auth result: ${result.outcome}`);
    } catch (e) {
      await clearOAuthFlowState();
      const scope = provider === 'facebook' ? 'facebook' : 'auth';
      await dbg(
        `${provider}_oauth_failed`,
        {
          provider,
          mode: 'sign_in',
          screen: 'auth/login',
          finalOutcome: 'failed',
          ...sanitizeAuthError(e),
          config:
            provider === 'facebook'
              ? facebookConfigChecklist(getFacebookRedirectUrl())
              : null,
        },
        scope
      );
      show(getSocialAuthErrorMessage(provider, e, 'sign in'));
    }
  };

  const onSignIn = async () => {
    passwordAuthDiagnostic('submit_started');
    if (!emailValid || !pwdValid) {
      cayenneAuthStage('auth_client_validation_failed');
      return;
    }

    if (busyRef.current) return;
    const attemptId = attemptRef.current + 1;
    attemptRef.current = attemptId;
    const isCurrent = () => mountedRef.current && attemptRef.current === attemptId;

    busyRef.current = true;
    setBusy(true);
    const submittedAt = Date.now();
    try {
      cayenneAuthStage('auth_client_validation_passed');
      // Analytics must never hold the visible authentication operation open.
      void trackEvent({ eventName: 'auth_started', screen: 'auth/login', metadata: { auth_method: 'password' } }).catch(() => {});
      const { user } = await runPasswordSignInAttempt({
        signIn: () => supabase.auth.signInWithPassword({ email, password }),
        bootstrapProfile: afterAuthSuccess,
        isCurrent,
        onPhase: passwordAuthDiagnostic,
      });
      if (!isCurrent() || !user?.id) return;

      passwordAuthDiagnostic('navigation_requested');
      console.info('[cayenne-auth] submit_completed', { outcome: 'session_received', duration_ms: Date.now() - submittedAt });
      router.replace('/(tabs)/home');
    } catch (e) {
      if (!isCurrent()) return;
      if (e?.code === 'PASSWORD_AUTH_TIMEOUT') passwordAuthDiagnostic('attempt_timed_out');
      console.info('[cayenne-auth] submit_completed', { outcome: 'error', duration_ms: Date.now() - submittedAt });
      show(getPasswordSignInErrorMessage(e));
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
        passwordAuthDiagnostic('loading_cleanup_completed');
      }
    }
  };

  const cancelPasswordAttempt = () => {
    if (busyRef.current) {
      attemptRef.current += 1;
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
      passwordAuthDiagnostic('attempt_cancelled');
    }
    router.back();
  };

  const onSignUp = async () => {
    if (!emailValid || !pwdValid) return;

    const uname = String(username || '').trim();
    if (!USERNAME_REGEX.test(uname)) {
      show('Username must be 3 to 20 characters and use only letters, numbers, underscore.');
      return;
    }

    setBusy(true);
    try {
      const check = await isUsernameTaken(uname);
      if (check.taken) {
        show(check.reason || 'That username is already taken. Choose another.');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: uname } },
      });

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('user already exists')) {
          show('Email already exists. Try signing in.');
          return;
        }
        throw error;
      }

      // Ensure we have an authenticated user when confirmation is off
      let authedUser = data?.session?.user || data?.user || null;

      if (!data?.session) {
        const { data: si, error: siErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (!siErr) authedUser = si?.user || si?.session?.user || authedUser;
      }

      const { data: userData } = await supabase.auth.getUser();
      authedUser = userData?.user || authedUser;

      if (!authedUser?.id) {
        show('Check your email to confirm your account. After you sign in, your username will be applied.');
        return;
      }

      // For email signup, prefer the typed username if present
      try {
        await supabase.from('users').upsert({ user_id: authedUser.id, username: uname }, { onConflict: 'user_id' });
      } catch {
        // ignore
      }

      await applyOnboardingDestinationSuggestionIfAny(authedUser.id);
      await applyOnboardingSeedRatingIfAny(authedUser.id);

      router.replace('/(tabs)/home');
    } catch (e) {
      show(e?.message || 'Sign-up failed');
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async () => {
    if (!emailValid) {
      show('Enter a valid email first.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: RESET_HANDOFF_URL,
      });
      if (error) throw error;

      show(`Reset email sent to ${email}. Check your inbox.`);
    } catch (e) {
      show(e?.message || 'Could not send reset email');
    } finally {
      setBusy(false);
    }
  };

  const headerIconColor = theme.colors.onSurface;
  const screenBg = theme.colors.background;
  const socialButtons = getSocialAuthButtonModels(activeSocialProvider).filter(
    (button) => ENABLE_GOOGLE_AUTH || button.provider !== 'google'
  );

  return (
    <View testID="auth.screen" style={[styles.screen, { backgroundColor: screenBg }]}>
      <View style={styles.topBar}>
        <Pressable onPress={cancelPasswordAttempt} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={26} color={headerIconColor} />
        </Pressable>
        <View style={{ flex: 1 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            <Card.Content style={{ gap: 12 }}>
              <Text variant="headlineSmall" style={styles.title}>
                {mode === 'signup' ? 'Create your BuffaGo account' : 'Sign in to BuffaGo'}
              </Text>

              {socialButtons.map((button) => (
                <Button
                  testID={button.provider === 'google' ? 'auth.google.button' : 'auth.facebook.button'}
                  key={button.provider}
                  mode="outlined"
                  icon={button.loading ? undefined : button.icon}
                  loading={button.loading}
                  disabled={button.disabled || busy}
                  onPress={() => handleSocialAuth(button.provider)}
                  style={[
                    styles.oauthBtn,
                    button.provider === 'google' ? styles.googleBtn : styles.facebookBtn,
                  ]}
                  contentStyle={styles.oauthBtnContent}
                  labelStyle={styles.oauthBtnLabel}
                  accessibilityLabel={button.label}
                >
                  {button.label}
                </Button>
              ))}

              <Text style={styles.orText}>or continue with email</Text>

              <SegmentedButtons
                value={mode}
                onValueChange={setMode}
                buttons={[
                  { value: 'signup', label: 'Sign Up', testID: 'auth.mode.signup' },
                  { value: 'signin', label: 'Sign In', testID: 'auth.mode.signin' },
                ]}
                density="medium"
                style={{ marginTop: 4 }}
              />

              {mode === 'signup' ? (
                <>
                  <TextInput
                    label="Username"
                    value={username}
                    onChangeText={setUsername}
                    mode="outlined"
                    autoCapitalize="none"
                    style={styles.input}
                  />
                  <HelperText type={unameValid || unameTrim.length === 0 ? 'info' : 'error'} visible={unameTrim.length > 0 && !unameValid}>
                    Username must be 3 to 20 characters and use only letters, numbers, underscore.
                  </HelperText>
                </>
              ) : null}

              <TextInput
                testID="auth.email.input"
                label="Email"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <HelperText type={emailValid || email.length === 0 ? 'info' : 'error'} visible={!emailValid && email.length > 0}>
                Enter a valid email.
              </HelperText>

              <TextInput
                testID="auth.password.input"
                label="Password"
                value={password}
                onChangeText={setPassword}
                mode="outlined"
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={mode === 'signin' ? onSignIn : onSignUp}
                right={<TextInput.Icon icon={showPwd ? 'eye-off' : 'eye'} onPress={() => setShowPwd((s) => !s)} />}
                style={styles.input}
              />
              <HelperText type={pwdValid || password.length === 0 ? 'info' : 'error'} visible={!pwdValid && password.length > 0}>
                Minimum 6 characters.
              </HelperText>

              <View testID="auth.signin.button">
                <Button
                  mode="contained"
                  accessibilityLabel="Sign In"
                  testID="auth.signin.native-action"
                  onPress={mode === 'signin' ? onSignIn : onSignUp}
                  disabled={!canSubmit || busy}
                  style={styles.primaryBtn}
                >
                  {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Button>
              </View>

              <Button mode="text" onPress={onForgot} disabled={busy} style={{ marginTop: 2 }}>
                Forgot password?
              </Button>

              {busy ? <View testID="auth.loading"><ActivityIndicator style={{ marginTop: 8 }} /></View> : null}

              <Button mode="text" onPress={cancelPasswordAttempt} style={{ marginTop: 6 }}>
                Cancel
              </Button>
            </Card.Content>
          </Card>

          <Snackbar testID="auth.error" visible={snack.open} onDismiss={() => setSnack({ open: false, msg: '' })} duration={3000}>
            {snack.msg}
          </Snackbar>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    fontWeight: '800',
  },
  input: {
    borderRadius: 12,
  },
  oauthBtn: {
    borderRadius: 12,
    marginTop: 6,
  },
  oauthBtnContent: {
    minHeight: 52,
  },
  oauthBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  googleBtn: {
    borderColor: '#DADCE0',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  facebookBtn: {
    borderColor: '#1877F2',
    backgroundColor: 'rgba(24,119,242,0.08)',
  },
  orText: {
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 4,
  },
  primaryBtn: {
    borderRadius: 12,
    marginTop: 6,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
});
