import { trackEvent } from '../../lib/analytics';
import { buildMascotEventOptions } from './analyticsDomain';
import type { MascotMood, MascotMomentType, MascotPose, MascotSurface } from './types';

export type MascotAnalyticsEvent =
  | 'mascot_moment_viewed'
  | 'mascot_primary_action_pressed'
  | 'mascot_secondary_action_pressed'
  | 'mascot_celebration_completed'
  | 'mascot_error_retry_pressed'
  | 'mascot_share_started'
  | 'mascot_share_completed';

export type MascotAnalyticsContext = {
  surface: MascotSurface;
  momentType: MascotMomentType;
  pose: MascotPose;
  mood: MascotMood;
  sourceScreen: string;
  animationEnabled: boolean;
  reducedMotion: boolean;
  actionId?: string;
  userStateCategory?: 'guest' | 'new' | 'active' | 'returning' | 'lapsed';
};

export function trackMascotEvent(
  eventName: MascotAnalyticsEvent,
  context: MascotAnalyticsContext
) {
  const options = buildMascotEventOptions(eventName, context);
  if (!options) return Promise.resolve();
  return trackEvent(options);
}
