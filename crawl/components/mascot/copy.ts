import type { MascotSurface } from './types';

type MascotCopy = Readonly<{ title: string; message: string; primaryAction?: string }>;

export const mascotCopy: Partial<Record<MascotSurface, MascotCopy>> = Object.freeze({
  'onboarding-welcome': {
    title: 'Find your next wing.',
    message: 'Rate spots, build crawls, and earn your way across the map.',
    primaryAction: 'Get started',
  },
  'crawl-create-loading': {
    title: 'Building your crawl',
    message: 'We’re lining up the route. This may take a moment.',
  },
  'crawl-empty': {
    title: 'No crawl in flight.',
    message: 'Build a route when you’re ready to rate a few stops.',
    primaryAction: 'Build a crawl',
  },
  'crawl-complete': {
    title: 'Crawl complete.',
    message: 'Every stop is rated. Your results are ready.',
    primaryAction: 'View results',
  },
  'passport-empty': {
    title: 'Your passport starts here.',
    message: 'Rate a wing spot to earn your first state stamp.',
    primaryAction: 'Find wings',
  },
  'wingdex-empty': {
    title: 'No wings here yet.',
    message: 'Broaden your search or add the missing restaurant.',
    primaryAction: 'Add restaurant',
  },
  'passport-milestone': {
    title: 'Passport reward unlocked.',
    message: 'Your badge and XP are already in your BuffaGo journey.',
    primaryAction: 'Keep exploring',
  },
  'mission-status': {
    title: 'Your daily mission.',
    message: 'One focused move keeps your wing journey moving.',
  },
  'recoverable-error': {
    title: 'That didn’t land.',
    message: 'Nothing was lost. Try again when you’re ready.',
    primaryAction: 'Try again',
  },
  offline: {
    title: 'You’re offline.',
    message: 'Reconnect to refresh nearby spots and progress.',
    primaryAction: 'Try again',
  },
});

export function getMascotCopy(surface: MascotSurface) {
  return mascotCopy[surface];
}
