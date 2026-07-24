import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

export type MascotPose =
  | 'hero'
  | 'guide'
  | 'thinking'
  | 'celebrating'
  | 'searching'
  | 'passport'
  | 'sad'
  | 'sleeping'
  | 'crowned'
  | 'spicy';

export type MascotMood =
  | 'neutral'
  | 'welcoming'
  | 'searching'
  | 'thinking'
  | 'celebrating'
  | 'encouraging'
  | 'disappointed'
  | 'sleeping'
  | 'spicy'
  | 'victorious';

export type MascotSize = 'icon' | 'small' | 'medium' | 'large' | 'hero';

export type MascotMomentType =
  | 'onboarding'
  | 'education'
  | 'empty'
  | 'loading'
  | 'success'
  | 'achievement'
  | 'error'
  | 'permission'
  | 'mission'
  | 'streak'
  | 'crawl'
  | 'passport'
  | 'share';

export type MascotSurface =
  | 'onboarding-welcome'
  | 'onboarding-crawl-preview'
  | 'crawl-create-loading'
  | 'crawl-empty'
  | 'crawl-complete'
  | 'badge-unlock'
  | 'passport-empty'
  | 'passport-milestone'
  | 'wingdex-empty'
  | 'mission-status'
  | 'recoverable-error'
  | 'location-permission'
  | 'offline'
  | 'share-card'
  | 'map-header'
  | 'rating-controls'
  | 'navigation'
  | 'active-crawl';

export type MascotAction = {
  id: string;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

export type ResolvedMascotAsset = {
  source: ImageSourcePropType;
  requestedPose: MascotPose;
  resolvedPose: 'hero';
  usedFallback: boolean;
};

export type MascotCommonProps = {
  pose?: MascotPose;
  mood?: MascotMood;
  size?: MascotSize;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  analyticsSurface?: MascotSurface;
  analyticsMomentType?: MascotMomentType;
  sourceScreen?: string;
};
