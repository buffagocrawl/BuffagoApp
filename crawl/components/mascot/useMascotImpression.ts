import { useEffect, useRef } from 'react';
import { trackMascotEvent, type MascotAnalyticsContext } from './analytics';

export function useMascotImpression(visible: boolean, context: MascotAnalyticsContext) {
  const tracked = useRef(false);
  useEffect(() => {
    if (!visible) {
      tracked.current = false;
      return;
    }
    if (tracked.current) return;
    tracked.current = true;
    void trackMascotEvent('mascot_moment_viewed', context);
  }, [context, visible]);
}

