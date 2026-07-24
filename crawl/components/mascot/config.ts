import { isMascotSurfaceAllowed, parseMascotBoolean, parseMascotOption } from './domain';
import type { MascotSurface } from './types';

export type MascotVariant = 'control' | 'standard';
export type CelebrationFrequency = 'major-only' | 'standard' | 'all';

const surfaces: Record<MascotSurface, boolean> = {
  'onboarding-welcome': true,
  'onboarding-crawl-preview': true,
  'crawl-create-loading': true,
  'crawl-empty': true,
  'crawl-complete': true,
  'badge-unlock': true,
  'passport-empty': true,
  'passport-milestone': true,
  'wingdex-empty': true,
  'mission-status': true,
  'recoverable-error': true,
  'location-permission': true,
  offline: true,
  'share-card': true,
  'map-header': false,
  'rating-controls': false,
  navigation: false,
  'active-crawl': false,
};

export const mascotConfig = Object.freeze({
  enabled: parseMascotBoolean(process.env.EXPO_PUBLIC_MASCOT_ENABLED, true),
  animationsEnabled: parseMascotBoolean(
    process.env.EXPO_PUBLIC_MASCOT_ANIMATIONS_ENABLED,
    true
  ),
  debugLabels: __DEV__ && parseMascotBoolean(process.env.EXPO_PUBLIC_MASCOT_DEBUG_LABELS, false),
  variant: parseMascotOption(
    process.env.EXPO_PUBLIC_MASCOT_VARIANT,
    ['control', 'standard'],
    'standard'
  ) as MascotVariant,
  celebrationFrequency: parseMascotOption(
    process.env.EXPO_PUBLIC_MASCOT_CELEBRATION_FREQUENCY,
    ['major-only', 'standard', 'all'],
    'standard'
  ) as CelebrationFrequency,
  surfaces: Object.freeze(surfaces),
});

export function isMascotSurfaceEnabled(surface: MascotSurface) {
  return isMascotSurfaceAllowed(surface, mascotConfig);
}
