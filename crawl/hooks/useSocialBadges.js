import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSocialBadgeCounts } from '../lib/friends';

export function useSocialBadges() {
  const [counts, setCounts] = useState({
    pendingInvites: 0,
    unseenFriendActivity: 0,
    total: 0,
  });

  const refresh = useCallback(async () => {
    try {
      setCounts(await getSocialBadgeCounts());
    } catch {
      setCounts({ pendingInvites: 0, unseenFriendActivity: 0, total: 0 });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return undefined;
    }, [refresh])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { ...counts, refresh };
}
