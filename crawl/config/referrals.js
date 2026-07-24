export const REFERRALS_ENABLED =
  String(process.env.EXPO_PUBLIC_ENABLE_REFERRALS || '').toLowerCase() === 'true';
