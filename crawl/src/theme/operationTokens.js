// Shared visual tokens. Status colors communicate state, never eligibility.
export const operationTokens = Object.freeze({
  colors: { background: '#090A0C', surface: '#101419', surfaceRaised: '#1D2025', border: '#30343B', orange: '#FF8310', success: '#78C996', amber: '#F0BE62', text: '#F5F6F8', muted: '#A9AFB9' },
  radius: { card: 16, control: 12, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  touchTarget: 44,
});

export function operationTabBarStyle(theme, bottomInset = 0) {
  const safeBottom = Math.max(bottomInset, 10);
  return { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outline, paddingTop: 6, paddingBottom: safeBottom, height: 64 + safeBottom, elevation: 0, shadowOpacity: 0 };
}
