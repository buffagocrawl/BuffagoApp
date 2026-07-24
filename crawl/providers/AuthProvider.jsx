// providers/AuthProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dbg } from '../lib/debugLog';
import { trackEvent } from '../lib/analytics';

/** @typedef {import('@supabase/supabase-js').Session} Session */
/** @typedef {import('@supabase/supabase-js').User} User */
/** @typedef {{session: Session|null, user: User|null, initializing: boolean}} AuthValue */

/** @type {import('react').Context<AuthValue>} */
const AuthContext = createContext({ session: null, user: null, initializing: true });

export function AuthProvider({ children }) {
  /** @type {[Session|null, import('react').Dispatch<import('react').SetStateAction<Session|null>>]} */
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    console.info('[auth] initial session load started');
    dbg('initial_session_load_started', { provider: 'AuthProvider' }, 'auth');

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession(data?.session ?? null);
        if (data?.session) {
          trackEvent({ eventName: 'auth_session_restored', screen: 'app_boot' });
        }
        console.info('[auth] initial session load completed', {
          hasSession: Boolean(data?.session),
          userId: data?.session?.user?.id ?? null,
          error: error?.message ?? null,
        });
        dbg(
          'initial_session_load_completed',
          {
            hasSession: Boolean(data?.session),
            userId: data?.session?.user?.id ?? null,
            error: error?.message ?? null,
          },
          'auth'
        );
      })
      .catch((error) => {
        if (!active) return;
        console.warn('[auth] initial session load failed', error?.message || error);
        dbg(
          'initial_session_load_failed',
          { message: error?.message || String(error) },
          'auth'
        );
      })
      .finally(() => {
        if (active) setInitializing(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      console.info('[auth] auth event', {
        event: _event,
        hasSession: Boolean(newSession),
        userId: newSession?.user?.id ?? null,
      });
      dbg('supabase_auth_state_changed', {
        event: _event,
        hasSession: Boolean(newSession),
        hasUserId: Boolean(newSession?.user?.id),
        userId: newSession?.user?.id || null,
      }, 'auth');
    });
    return () => {
      active = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, initializing }),
    [initializing, session]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
