import type { ImageSourcePropType } from 'react-native';
import { MASCOT_ASSETS } from './registry';

let preloadPromise: Promise<readonly ImageSourcePropType[]> | null = null;

/**
 * Local mascot images are Metro bundle assets, so resolving them is sufficient
 * and never starts a network request. This idempotent API can adopt an image
 * library's decode prefetch later without changing celebration call sites.
 */
export function preloadMascotAssets(): Promise<readonly ImageSourcePropType[]> {
  if (!preloadPromise) preloadPromise = Promise.resolve(Object.values(MASCOT_ASSETS));
  return preloadPromise;
}

