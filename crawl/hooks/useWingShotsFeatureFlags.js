import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadPhotoWorkflowFlags } from '../lib/photoWorkflowFlags';

const DISABLED_FLAGS = Object.freeze({
  prompt: false,
  photo: false,
  video: false,
  creatorLeaderboard: false,
});

export function useWingShotsFeatureFlags(isAuthenticated) {
  const [flags, setFlags] = useState(DISABLED_FLAGS);
  const [loading, setLoading] = useState(Boolean(isAuthenticated));
  const requestRef = useRef(0);

  const refresh = useCallback(async (required = false) => {
    const request = ++requestRef.current;
    if (!isAuthenticated) {
      setFlags(DISABLED_FLAGS);
      setLoading(false);
      return DISABLED_FLAGS;
    }

    setLoading(true);
    try {
      const next = await loadPhotoWorkflowFlags(supabase);
      if (request === requestRef.current) setFlags(next);
      return next;
    } catch (error) {
      if (request === requestRef.current) setFlags(DISABLED_FLAGS);
      if (required) throw error;
      return DISABLED_FLAGS;
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
    return () => { requestRef.current += 1; };
  }, [refresh]);

  return { flags, loading, refresh };
}
