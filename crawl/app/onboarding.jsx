import React from 'react';
import OnboardingFlow from '../components/OnboardingFlow';
import ShortOnboardingFlow from '../components/ShortOnboardingFlow';
import { getAnonymousId } from '../lib/analytics';
import { assignVariant } from '../lib/onboardingExperiment';
import { ENABLE_ONBOARDING_FIRST_VALUE_EXPERIMENT } from '../config/features';

function OnboardingExperimentRoute() {
  const [experimentUserId, setExperimentUserId] = React.useState(null);
  React.useEffect(() => { getAnonymousId().then(setExperimentUserId); }, []);
  if (!experimentUserId) return null;
  return assignVariant({ experimentUserId, enabled: ENABLE_ONBOARDING_FIRST_VALUE_EXPERIMENT }) === 'treatment'
    ? <ShortOnboardingFlow experimentUserId={experimentUserId} />
    : <OnboardingFlow />;
}

export default function OnboardingRoute() {
  return <OnboardingExperimentRoute />;
}
