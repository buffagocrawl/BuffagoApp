import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENABLE_BUFFAVERSE, ENABLE_LEGENDARY_RESTAURANTS } from '../config/features';
import { fetchLegendaryFeed } from '../lib/buffaverse/legendaryFeed';
import { legendaryByRestaurant } from '../lib/buffaverse/legendaryProjection';

export function useLegendaryFeed({ enabled = true, limit = 25 } = {}) {
  const featureEnabled = Boolean(enabled && ENABLE_BUFFAVERSE && ENABLE_LEGENDARY_RESTAURANTS);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState(featureEnabled ? 'loading' : 'disabled');
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!featureEnabled) {
      setEvents([]);
      setStatus('disabled');
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);
    try {
      const next = await fetchLegendaryFeed({ limit });
      setEvents(next);
      setStatus(next.length ? 'ready' : 'empty');
    } catch (nextError) {
      setEvents([]);
      setError(nextError);
      setStatus('error');
    }
  }, [featureEnabled, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byRestaurant = useMemo(() => legendaryByRestaurant(events), [events]);
  return { enabled: featureEnabled, events, byRestaurant, status, error, refresh };
}
