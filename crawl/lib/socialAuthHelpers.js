export const SOCIAL_AUTH_BUTTONS = Object.freeze([
  {
    provider: 'google',
    label: 'Continue with Google',
    icon: 'google',
  },
  {
    provider: 'facebook',
    label: 'Continue with Facebook',
    icon: 'facebook',
  },
]);

export function getSocialAuthButtonModels(activeProvider = null) {
  return SOCIAL_AUTH_BUTTONS.map((config) => ({
    ...config,
    loading: activeProvider === config.provider,
    disabled: activeProvider !== null,
  }));
}

export function getSocialAuthErrorMessage(provider, error, fallbackAction = 'sign in') {
  const message = String(error?.message || '').trim();
  if (message) return message;

  if (provider === 'google') return `Google ${fallbackAction} failed`;
  if (provider === 'facebook') return `Facebook ${fallbackAction} failed`;
  return `Social ${fallbackAction} failed`;
}

export async function executeSocialAuth(provider, deps) {
  const {
    activeProvider,
    setActiveProvider,
    startOAuth,
    onCallbackReady,
    onCancelled,
  } = deps;

  if (activeProvider) return { blocked: true, outcome: 'busy' };

  setActiveProvider(provider);
  try {
    const result = await startOAuth(provider);

    if (result?.outcome === 'callback') {
      await onCallbackReady?.(provider, result);
      return { blocked: false, outcome: 'callback', result };
    }

    if (result?.outcome === 'cancelled') {
      await onCancelled?.(provider, result);
      return { blocked: false, outcome: 'cancelled', result };
    }

    return { blocked: false, outcome: result?.outcome || 'unknown', result };
  } finally {
    setActiveProvider(null);
  }
}
