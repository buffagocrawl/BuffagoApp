// components/GamificationHeader.jsx
import React from 'react';
import { View } from 'react-native';
import { Text, ProgressBar, useTheme, Chip, Avatar } from 'react-native-paper';

function safeNum(n, def = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : def;
}

export default function GamificationHeader({
  xp = 0,
  level = 1,
  // new optional props from profile screen
  xpMin,
  xpMax,
  xpInto,
  xpToNext,
  progressPct,
  // extras
  streakWeeks = 0,
  badges = [],
}) {
  const theme = useTheme();
  const isDark = !!theme.dark;

  // Prefer values passed in from the page (which looked up level_thresholds),
  // and fall back gracefully if any are missing.
  const min = safeNum(xpMin, 0);
  const max = (() => {
    const provided = Number(xpMax);
    if (Number.isFinite(provided)) return provided;
    // Fallback if not provided: assume next threshold is at least current xp + 1000
    return Math.max(safeNum(xp) + 1, 1000);
  })();
  const span = Math.max(1, max - min);

  const into = Number.isFinite(Number(xpInto)) ? Number(xpInto) : Math.max(0, safeNum(xp) - min);
  const toNext = Number.isFinite(Number(xpToNext)) ? Number(xpToNext) : Math.max(0, max - safeNum(xp));
  const pct =
    Number.isFinite(Number(progressPct))
      ? Math.max(0, Math.min(1, Number(progressPct)))
      : Math.max(0, Math.min(1, into / span));

  // Displayed pair, e.g. "1255 / 1400 XP"
  const xpDisplayNow = safeNum(xp);
  const xpDisplayNext = max; // uses real threshold

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
        backgroundColor: theme.colors.elevation?.level2 ?? (isDark ? '#1f1f1f' : '#f7f7f8'),
      }}
    >
      {/* Level + XP numbers */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '900', fontSize: 20 }}>Level {level}</Text>
      </View>

      {/* Progress bar */}
      <ProgressBar progress={pct} style={{ height: 10, borderRadius: 10 }} />

      {/* Small meta row: into / remaining */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ opacity: 0.7, fontWeight: '600' }}>
          +{Math.round(into)} into level
        </Text>
        <Text style={{ opacity: 0.7, fontWeight: '600' }}>
          {Math.max(0, Math.round(toNext))} to next
        </Text>
      </View>

      {/* Optional streak + badges */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {safeNum(streakWeeks) > 0 && (
          <Chip compact icon="fire">
            {streakWeeks} week{streakWeeks === 1 ? '' : 's'} streak
          </Chip>
        )}
      </View>
    </View>
  );
}
