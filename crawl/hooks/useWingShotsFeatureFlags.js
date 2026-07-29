import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const DISABLED_FLAGS = Object.freeze({
  prompt: false,
  photo: false,
  video: false,
  creatorLeaderboard: false,
});

const CLIENT_KEYS = Object.freeze({
  wing_shot_prompt: 'prompt',
  wing_shot_photo_upload: 'photo',
  wing_shot_video_upload: 'video',
  wing_shot_creator_leaderboard: 'creatorLeaderboard',
});

export function useWingShotsFeatureFlags(isAuthenticated) {
  const [flags, setFlags] = useState(DISABLED_FLAGS);
  const [loading, setLoading] = useState(Boolean(isAuthenticated));

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setFlags(DISABLED_FLAGS);
      setLoading(false);
      return DISABLED_FLAGS;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_wing_shots_feature_flags');
      if (error) throw error;
      const next = { ...DISABLED_FLAGS };
      for (const row of data || []) {
        const key = CLIENT_KEYS[row.flag_key];
        if (key) next[key] = row.enabled_for_user === true;
      }
      setFlags(next);
      return next;
    } catch {
      setFlags(DISABLED_FLAGS);
      return DISABLED_FLAGS;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { flags, loading, refresh };
}
