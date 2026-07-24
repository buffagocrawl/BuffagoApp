import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useAuth } from '../providers/AuthProvider';
import { claimPendingReferral, parseReferralUrl, recognizeReferral } from '../lib/referrals';
import { REFERRALS_ENABLED } from '../config/referrals';

export default function ReferralAttributionBridge() {
  const { user, initializing } = useAuth();
  const handledInitialRef = useRef(false);

  useEffect(() => {
    const handle = (url) => {
      if (!REFERRALS_ENABLED) return;
      if (!parseReferralUrl(url)) return;
      recognizeReferral(url, { screen: 'referral_link' })
        .then(() => (user?.id ? claimPendingReferral({ placement: 'deep_link' }) : null))
        .catch((error) => console.warn('[referral] link handling failed', error?.message || error));
    };
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    if (!handledInitialRef.current) {
      handledInitialRef.current = true;
      Linking.getInitialURL().then(handle).catch(() => {});
    }
    return () => subscription.remove();
  }, [user?.id]);

  useEffect(() => {
    if (!REFERRALS_ENABLED || initializing || !user?.id) return;
    claimPendingReferral({ placement: 'auth_transition' }).catch((error) => {
      console.warn('[referral] deferred claim failed', error?.message || error);
    });
  }, [initializing, user?.id]);

  return null;
}
