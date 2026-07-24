import type { ImageSourcePropType } from 'react-native';
import { resolveMascotPoseName } from './domain';
import type { MascotPose, ResolvedMascotAsset } from './types';

const HERO_ASSET = require('../../assets/wing-user.png') as ImageSourcePropType;
const assets: Readonly<Record<'hero', ImageSourcePropType>> = Object.freeze({ hero: HERO_ASSET });
const warnedPoses = new Set<string>();

export function resolveMascotAsset(pose: MascotPose = 'hero'): ResolvedMascotAsset {
  const resolution = resolveMascotPoseName(pose, Object.keys(assets));
  if (resolution.usedFallback && __DEV__ && !warnedPoses.has(resolution.requestedPose)) {
    warnedPoses.add(resolution.requestedPose);
    console.warn(
      `[mascot] Pose "${resolution.requestedPose}" is not registered; using the hero asset.`
    );
  }
  return {
    source: assets.hero,
    requestedPose: resolution.requestedPose as MascotPose,
    resolvedPose: 'hero',
    usedFallback: resolution.usedFallback,
  };
}

export const MASCOT_ASSETS = assets;

