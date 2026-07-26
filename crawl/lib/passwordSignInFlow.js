import { withPasswordAuthTimeout } from './passwordAuthTimeout.js';

export function createPasswordSignInCancelledError() {
  const error = new Error('Sign-in attempt was cancelled.');
  error.code = 'PASSWORD_SIGN_IN_CANCELLED';
  return error;
}

export function createProfileBootstrapError() {
  const error = new Error("We signed you in, but couldn't finish setting up your profile. Please try again.");
  error.code = 'PASSWORD_PROFILE_BOOTSTRAP_FAILED';
  return error;
}

export function createSessionMissingError() {
  const error = new Error("We couldn't start your session. Please try signing in again.");
  error.code = 'PASSWORD_SESSION_MISSING';
  return error;
}

export function getPasswordSignInErrorMessage(error) {
  if (error?.code === 'PASSWORD_AUTH_TIMEOUT') {
    return 'Sign-in timed out. Check your connection and try again.';
  }
  if (error?.code === 'PASSWORD_PROFILE_BOOTSTRAP_FAILED') return error.message;
  if (error?.code === 'PASSWORD_SESSION_MISSING') return error.message;

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return "Couldn't reach BuffaGo. Check your connection and try again.";
  }
  return "Couldn't sign in. Please try again.";
}

/**
 * Runs the complete user-visible password sign-in operation. Callers provide
 * isCurrent so a cancelled, timed-out, or superseded attempt cannot continue
 * into profile work or navigation when a late request eventually resolves.
 */
export async function runPasswordSignInAttempt({
  signIn,
  bootstrapProfile,
  isCurrent = () => true,
  onPhase = () => {},
  timeoutMs,
}) {
  const requireCurrent = () => {
    if (!isCurrent()) throw createPasswordSignInCancelledError();
  };

  const operation = async () => {
    requireCurrent();
    onPhase('supabase_request_started');
    const { data, error } = await signIn();
    onPhase('supabase_response_received');
    requireCurrent();
    if (error) throw error;

    const session = data?.session ?? null;
    const user = session?.user || data?.user || null;
    onPhase(session ? 'session_present' : 'session_absent');
    if (!session || !user?.id) throw createSessionMissingError();

    try {
      onPhase('profile_bootstrap_started');
      await bootstrapProfile(user);
      onPhase('profile_bootstrap_completed');
    } catch (error) {
      onPhase('profile_bootstrap_failed');
      throw createProfileBootstrapError();
    }
    requireCurrent();
    return { session, user };
  };

  return withPasswordAuthTimeout(operation(), timeoutMs);
}
