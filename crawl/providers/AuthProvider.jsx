// providers/AuthProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dbg } from '../lib/debugLog';

const AuthContext = createContext({ session: null, user: null });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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

  const value = useMemo(() => ({ session, user: session?.user ?? null }), [session]);
  if (initializing) return null;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
