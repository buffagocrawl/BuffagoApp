import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { isEngagementFeatureEnabled } from '../../config/engagementFlags';
import { loadRetentionDashboard } from '../../lib/engagement/retentionService';
import {
  getDeviceTimeZone,
  mapRetentionDashboard,
} from '../../lib/home/retentionDashboard';
import { trackEvent } from '../../lib/analytics';
import { WeeklyChallengeCard } from '../home/MissionDashboard';

export default function RetentionJourneyCard({ supabase, userId }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId || !isEngagementFeatureEnabled('weekly_challenges')) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await loadRetentionDashboard(supabase, {
        timezone: getDeviceTimeZone(),
      });
      setDashboard(mapRetentionDashboard(payload));
    } catch {
      setError(new Error('Weekly challenge is temporarily unavailable.'));
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!userId || !isEngagementFeatureEnabled('weekly_challenges')) return null;
  return (
    <View style={{ gap: 8 }}>
      <WeeklyChallengeCard
        challenge={dashboard?.weekly}
        loading={loading}
        error={error}
        onRetry={refresh}
        onPress={() =>
          trackEvent({
            eventName: 'weekly_challenge_viewed',
            screen: 'journey',
            userId,
            metadata: { source: 'journey_history' },
          })
        }
      />
      {dashboard?.streak ? (
        <Text style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12 }}>
          {dashboard.streak.current_streak || 0}-day wing streak · best{' '}
          {dashboard.streak.longest_streak || 0}. Ratings, battle votes, and crawl
          stops keep it alive.
        </Text>
      ) : null}
    </View>
  );
}
